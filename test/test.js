/*global before after beforeEach afterEach describe it*/

// var async = require('async');
var Q = require('kew');
var nano = require('nano')('http://localhost:5984');
var cores = require('../index.js');
var jski = require('jski');

var assert = require('assert');
var util = require('util');

var articleSchema = require('./article-schema.js');
var articleDesign = require('./article-design.js');
var articleData = require('./article-data.js');


function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}


describe('cores', function() {

  // create db before tests and destroy afterwards
  var dbName = 'test-cores';
  var db = nano.use(dbName);
  cores = cores(db);

  before(function(done) {
    // setup test db
    nano.db.get(dbName, function(err, body) {
      if (!err) {
        // db exists, recreate
        nano.db.destroy(dbName, function(err) {
          if (err) done(err);
          nano.db.create(dbName, done);
        });
      }
      else if (err.reason === 'no_db_file'){
        // create the db
        nano.db.create(dbName, done);
      }
      else done(err);
    });
  });

  after(function(done) {
    nano.db.destroy(dbName, done);
  });


  describe('resource', function() {

    // test data
    var resName = 'Article';
    var res = null;


    it('should create with schema', function(done) {
      cores.create(resName, { schema: articleSchema }).then(function(r) {
        assert(typeof r === 'object');
        done();
      }, done);
    });


    it('should have properties defined', function(done) {
      cores.create(resName, { schema: articleSchema }).then(function(r) {
        assert(r.cores === cores);
        assert(r.name === resName);
        assert(typeof r.schema === 'object');
        assert(typeof r.design === 'object');
        done();
      }, done);
    });


    it('should not create with invalid schema', function(done) {
      cores.create(resName, { schema: { properties: { type: 'boolean' }}}).then(function(r) {
        assert(false);
      }, function(err) {
        assert(util.isError(err));
        done();
      });
    });


    it('should not create with invalid design', function(done) {
      cores.create(resName, { schema: articleSchema, design: { views:'' } }).then(function(r) {
        assert(false);
      }, function(err) {
        assert(util.isError(err));
        done();
      });
    });

    it('should create with schema and design', function(done) {
      cores.create(resName, { schema: articleSchema, design: articleDesign }).then(function(r) {
          res = r;

          assert(typeof res.load === 'function');
          assert(typeof res.save === 'function');
          assert(typeof res.destroy === 'function');
          assert(typeof res.view === 'function');

          done();
      }, done);
    });


    it('should upload design to db', function(done) {
      db.get('_design/' + res.design.name, function(err, doc) {
        assert(!err);
        assert(doc.views.all);
        assert(doc.views.titles);
        done();
      });
    });



    describe('crud', function() {

      var doc = clone(articleData);

      it('should not validate data without required properties', function(done) {
        res.validate({ type_: 'Article' }).then(function(doc) {
          assert(false);
        }, function(err) {
          assert(util.isError(err));
          done();
        });
      });


      it('should validate with required properties', function(done) {
        res.validate(articleData).then(function(doc) {
          done();
        }, done);
      });


      it('should not save when not valid', function(done) {
        res.save({ type_: 'Article' }).then(function(doc) {
          assert(false);
        }, function(err) {
          assert(util.isError(err));
          done();
        });
      });


      it('should save when valid', function(done) {
        res.save(doc).then(function(d) {
          assert(typeof d._id === 'string');
          assert(typeof d._rev === 'string');
          done();
        }, done);
      });


      it('should save when updated', function(done) {
        doc.title = 'Some other title';
        res.save(doc).then(function(d) {
          assert(d._id === doc._id);
          assert(d._rev === doc._rev);
          done();
        }, done);
      });


      it('should not save when has wrong type', function(done) {
        res.save({ _id: 'somefoo', type_: 'Foo' }).then(function(d) {
          assert(false);
        }, function(err) {
          assert(util.isError(err));
          done();
        });
      });


      it('should load', function(done) {
        res.load(doc._id).then(function(d) {
          assert(d.title === doc.title);
          done();
        }, done);
      });


      it('should not load nonexistant doc', function(done) {
        res.load('fooo').then(function(doc) {
          assert(false);
        }, function(err) {
          assert(util.isError(err));
          done();
        });
      });


      it('should destroy', function(done) {
        res.destroy(doc).then(function() {
          done();
        }, done);
      });


      it('should not destroy nonexistant doc', function(done) {
        res.destroy({ _id: 'foo', _rev: 'bar' }).then(function() {
          assert(false);
        }, function(err) {
          assert(util.isError(err));
          done();
        });
      });


      it('should save with id', function(done) {
        var d = clone(doc);
        delete d._rev;
        d._id = 'my-id';

        res.save(d).then(function(saveDoc) {
          return res.load('my-id');

        }).then(function(loadedDoc) {
          return res.destroy(loadedDoc);

        }).then(function() {
          done();
        }, done);
      });
    });


    describe('views', function() {

      var docs = [];
      var numDocs = 3;

      before(function(done) {

        var promises = [];
        for (var i = 0; i < numDocs; ++i) {
          var d = clone(articleData);
          d.title = d.title + ' ' + i;
          promises.push(res.save(d).then(function(doc) {
            docs.push(doc);
          }));
        }
        Q.all(promises).then(function() {
          done();
        }, done);
      });

      after(function(done) {
        var promises = [];
        docs.forEach(function(doc) {
          promises.push(res.destroy(doc));
        });
        Q.all(promises).then(function() {
          done();
        }, done);
      });


      it('should call the all view with no params', function(done) {
        res.view('all').then(function(result) {
          assert(result.total_rows === numDocs);
          done();
        }, done);
      });


      it('should call the all view with params', function(done) {
        res.view('all', { limit: 2  }).then(function(result) {
          assert(result.total_rows === numDocs);
          assert(result.rows.length === 2);
          done();
        }, done);
      });


      it('should call the titles view', function(done) {
        res.view('titles').then(function(result) {
          assert(result.total_rows === numDocs);
          done();
        }, done);
      });


      it('should call the titles view with params', function(done) {
        res.view('titles', { limit: 1 }).then(function(result) {
          assert(result.total_rows === numDocs);
          assert(result.rows.length === 1);
          done();
        }, done);
      });


      it('should respond with error when view does not exist', function(done) {
        res.view('foo').then(function(result) {
          assert(false);
        }, function(err) {
          assert(util.isError(err));
          done();
        });
      });
    });
  });


  describe('fetch docs', function() {

    var resName = 'Article';
    var resource = null;

    before(function(done) {
      cores.create(resName, { schema: articleSchema }).then(function(r) {
        resource = r;
        r.save(clone(articleData)).then(function(doc) {
          done();
        }, done());
      });
    });

    it('should fetch docs', function(done) {

      resource.view('all').then(function(result) {
        var keys = result.rows.map(function(row) { return row.id; });
        cores.fetch(keys).then(function(result) {
          assert(result.rows.length > 0);
          done();
        }, done);
      }, done);
    });
  });


  describe('fetch refs', function() {

    var resName = 'Article';
    var resource = null;
    var doc1, doc2, doc3;

    before(function(done) {
      cores.create(resName, { schema: articleSchema }).then(function(r) {
        resource = r;
        var data1 = clone(articleData);
        data1.title = 'the first one';
        var data2 = clone(articleData);
        data2.title = 'the second one';
        var data3 = clone(articleData);
        data3.title = 'the third one';

        r.save(data1).then(function(doc) {
          doc1 = doc;
          data2.other = { id_: doc._id };
          data3.other1 = { id_: doc._id };
          return r.save(data2);

        }).then(function(doc) {
          doc2 = doc;
          data3.other2 = { id_: doc._id };
          return r.save(data3);

        }).then(function(doc) {
          doc3 = doc;
          done();
        }, done);
      });
    });

    it('should fetch doc refs', function(done) {
      cores.fetchDocRefs(doc2).then(function(doc) {
        assert(doc.other.title === 'the first one');
        done();
      }, done);
    });

    it('should fetch multiple docs refs', function(done) {
      var keys = [doc2._id, doc3._id];
      resource.view('all', { keys: keys, include_docs: true }).then(function(result) {
        var docs = result.rows.map(function(row) {
          return row.doc;
        });

        cores.fetchDocsRefs(docs).then(function(docs) {
          var d2 = docs[0]._id === doc2._id ? docs[0] : docs[1];
          var d3 = docs[0]._id === doc2._id ? docs[1] : docs[0];
          assert(d2.other.title === 'the first one');
          assert(d3.other1.title === 'the first one');
          assert(d3.other2.title === 'the second one');
          done();
        });
      }, function(err) { console.log('err', err); done(err); });
    });
  });


  describe('uuids', function() {

    it('should get a uuid', function(done) {
      cores.uuids().then(function(result) {
        assert(result.uuids.length === 1);
        done();
      }, done);
    });

    it('should get multiple uuids', function(done) {
      cores.uuids(5).then(function(result) {
        assert(result.uuids.length === 5);
        done();
      }, done);
    });
  });
});