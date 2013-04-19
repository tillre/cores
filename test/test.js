/*global before after beforeEach afterEach describe it*/

var expect = require('chai').expect;
var async = require('async');
var nano = require('nano')('http://localhost:5984');
var comodl = require('../index.js');


describe('comodl', function() {

  // test data
  var layoutName = 'Article',
      schema = require('./schema'),
      design = require('./design'),
      hooks = require('./hooks'),
      data = require('./data');

  // create db before tests and destroy afterwards
  var dbName = 'test-comodl',
      db = nano.use(dbName),
      cm = comodl(db);

 
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


  describe('layout', function() {
    var layout = null;
    
    it('should create with schema and design', function(done) {
      cm.layout(layoutName, { schema: schema, design: design, hooks: hooks(cm) }, function(err, l) {
        expect(l).to.exist;
        layout = l;
        expect(layout).to.have.property('design');
        expect(layout.design).to.have.property('schema');
        expect(layout).to.have.property('name');
        done(err);
      });
    });

    it('should not create with invalid schema', function(done) {
      cm.layout('Foo', { schema: {bar:42}, design: design }, function(err, l) {
        expect(err).to.exist;
        expect(err.errors).to.be.a('array');
        expect(l).to.not.exist;
        done();
      });
    });

    it('should not create with invalid design', function(done) {
      cm.layout('Bar', { schema: schema, design: {views:''} }, function(err, l) {
        expect(err).to.exist;
        expect(err.errors).to.be.a('array');
        expect(l).to.not.exist;
        done();
      });
    });
    
    it('should auto create design when not passed', function(done) {
      cm.layout('Baz', { schema: schema }, function(err, l) {
        expect(err).to.not.exist;
        expect(l).to.exist;
        expect(l.design.views.all).to.exist;
        done();
      });
    });

    it('should be registered', function() {
      expect(cm.layouts.Article).to.exist;
    });

    it('should upload design and schema to the db', function(done) {
      db.get('_design/' + layout.design.name, function(err, doc) {
        expect(err).to.not.exist;
        expect(doc.views).to.be.a('object');
        expect(doc.views.all).to.be.a('object');
        expect(doc.schema).to.be.a('object');
        done();
      });
    });
  });

  
  describe('doc', function() {
    var layout = null,
        doc = null;

    before(function() {
      // depends on the layout tests
      layout = cm.layouts.Article;
    });
    
    it('should create with data', function(done) {
      cm.model.create(data, function(err, d) {
        expect(d).to.be.a('object');
        expect(d.type).to.be.a('string');
        expect(d.type).to.equal('Article');

        doc = d;
        done();
      });
    });

    it('should not create without type on data', function(done) {
      var d = { title: '', author: '', body: '' };
      cm.model.create(d, function(err, doc) {
        expect(err).to.exist;
        done();
      });
    });

    it('should not be valid without data', function(done) {
      cm.model.validate({ type: 'Article' }, function(err) {
        expect(err).to.exist;
        done();
      });
    });

    it('should not save when not valid', function(done) {
      cm.model.save({ type: 'Article' }, function(err, savedDoc) {
        expect(err).to.exist;
        expect(savedDoc).to.not.exist;
        done();
      });
    });
    
    it('should be valid after setting data', function(done) {
      doc = cm.model.setData(doc, data);
      cm.model.validate(doc, done);
    });

    it('should save when valid', function(done) {
      cm.model.save(doc, function(err, doc) {
        expect(err).to.not.exist;
        expect(doc).to.be.a('object');
        expect(doc).to.have.property('_id');
        expect(doc).to.have.property('_rev');
        done();
      });
    });

    it('should save when updated', function(done) {
      doc.title = 'Some other title';
      var id = doc._id;
      var rev = doc._rev;
      cm.model.save(doc, function(err, d) {
        expect(err).to.not.exist;
        expect(d._id).to.equal(id);
        expect(d._rev).to.not.equal(rev);
        doc = d;
        done();
      });
    });

    it('should load', function(done) {
      cm.model.load(doc._id, function(err, d) {
        expect(err).to.not.exist;
        expect(d).to.exist;
        expect(d._id).to.equal(doc._id);
        done();
      });
    });

    it('should have the properties from the hooks', function(done) {
      cm.model.load(doc._id, function(err, d) {
        expect(err).to.not.exist;
        expect(d.createHook).to.equal(true);
        expect(d.saveHook).to.equal(true);
        done();
      });
    });
    
    it('should destroy', function(done) {
      var id = doc._id;
      cm.model.destroy(doc._id, doc._rev, function(err) {
        cm.model.load(id, function(err, d) {
          expect(err).to.exist;
          expect(d).to.not.exist;
          done();
        });
      });
    });
  });

  
  describe('layout views', function() {
    var layout = null,
        docs = [],
        numDocs = 3;

    before(function(done) {
      // depends on the layout tests
      layout = cm.layouts.Article;
      async.times(numDocs, function(i, cb) {
        
        cm.model.create(data, function(err, d) {
          d.title = d.title + ' ' + i;
          cm.model.save(d, function(err, sd) {
            if (err) cb(err);
            else {
              docs.push(sd);
              cb();
            }
          });
        });
        
      }, done);
    });

    after(function(done) {
      async.each(docs, function(d, cb) {
        cm.model.destroy(d._id, d._rev, cb);
      }, done);
    });
    
    it('should have the standard all view', function(done) {
      cm.view(layout.name, 'all', function(err, docs) {
        expect(err).to.not.exist;
        expect(docs).to.be.a('array');
        expect(docs.length).to.equal(numDocs);
        expect(docs[0]).to.be.a('object');

        var doc = docs[0];
        expect(doc).to.have.property('_id');
        expect(doc).to.have.property('_rev');
        expect(doc).to.have.property('type');
        done();
      });
    });

    it('should call the custom view', function(done) {
      cm.view(layout.name, 'titles', function(err, docs) {
        expect(err).to.not.exist;
        expect(docs).to.be.a('array');
        expect(docs.length).to.equal(numDocs);
        expect(docs[0]).to.be.a('string');
        done();
      });
    });

    it('should respond with error when view does not exist', function(done) {
      cm.view(layout.name, 'foobar', function(err, docs) {
        expect(err).to.exist;
        expect(docs).to.not.exist;
        done();
      });
    });

    it('should call the view with params', function(done) {
      cm.view(layout.name, 'titles', {limit: 2}, function(err, docs) {
        expect(err).to.not.exist;
        expect(docs.length).to.equal(2);
        done();
      });
    });
  });
  
});