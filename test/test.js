/*global before after beforeEach afterEach describe it*/

var expect = require('chai').expect;
var async = require('async');
var nano = require('nano')('http://localhost:5984');
var comodl = require('../');


describe('comodl', function() {

  // test data
  var layoutName = 'Article',
      schema = require('./schema'),
      design = require('./design'),
      data = require('./data');

  // create db before tests and destroy afterwards
  var dbName = 'comodl-test',
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
    
    it('should create', function(done) {
      cm.layout(layoutName, schema, design, function(err, l) {
        expect(l).to.exist;
        layout = l;
        expect(layout).to.have.property('schema');
        expect(layout).to.have.property('design');
        expect(layout).to.have.property('name');
        expect(layout).to.have.property('hooks');
        done(err);
      });
    });

    it('should be registered', function() {
      expect(cm.layouts.Article).to.exist;
    });

    it('should be in the db', function(done) {
      db.get('_design/' + layout.design.name, done);
    });
  });

  
  describe('model', function() {
    var layout = null,
        model = null;

    before(function() {
      // depends on the layout tests
      layout = cm.layouts.Article;
    });
    
    it('should create with type', function() {
      model = cm.model.create(layout.name);
      expect(model).to.be.a('object');
      expect(model).to.have.property('type');
      expect(model).to.have.property('data');
      expect(model).to.have.property('id');
      expect(model).to.have.property('rev');
    });

    it('should create with type and data', function() {
      var m = cm.model.create(layout.name, data);
      expect(m).to.be.a('object');
      expect(m.type).to.be.a('string');
      expect(m.data).to.be.a('object');
      expect(m.type).to.equal('Article');
      expect(m.data.type).to.not.exist;
    });

    it('should create with data and data.type', function() {
      var m = cm.model.create(data);
      expect(m).to.be.a('object');
      expect(m.type).to.be.a('string');
      expect(m.data).to.be.a('object');
      expect(m.type).to.equal('Article');
      expect(m.data.type).to.not.exist;
    });

    it('should not be valid without data', function(done) {
      cm.model.validate(model, function(err) {
        expect(err).to.exist;
        done();
      });
    });

    it('should not save when not valid', function(done) {
      cm.model.save(model, function(err, model) {
        expect(err).to.exist;
        done();
      });
    });
    
    it('should be valid after setting data', function(done) {
      cm.model.setData(model, data);
      cm.model.validate(model, done);
    });

    it('should save when valid', function(done) {
      cm.model.save(model, function(err, model) {
        expect(err).to.not.exist;
        expect(model).to.be.a('object');
        expect(model.id).to.exist;
        done();
      });
    });

    it('should save when updated', function(done) {
      model.data.title = 'Some other title';
      cm.model.save(model, function(err, m2) {
        expect(err).to.not.exist;
        expect(model.id).to.equal(m2.id);
        expect(model.data._id).to.not.exist;
        expect(model.data._rev).to.not.exist;
        expect(model.data.type).to.not.exist;
        done();
      });
    });

    it('should load', function(done) {
      cm.model.load(model.id, function(err, m2) {
        expect(err).to.not.exist;
        expect(m2).to.exist;
        expect(m2.id).to.equal(model.id);
        expect(m2.rev).to.equal(model.rev);
        expect(JSON.stringify(m2.data)).to.equal(JSON.stringify(model.data));
        done();
      });
    });

    it('should destroy', function(done) {
      var id = model.id;
      cm.model.destroy(model.id, model.rev, function(err) {
        cm.model.load(id, function(err, model) {
          expect(err).to.exist;
          expect(model).to.not.exist;
          done();
        });
      });
    });
  });

  
  describe('layout views', function() {
    var layout = null,
        models = [];
        numModels = 3;

    before(function(done) {
      // depends on the layout tests
      layout = cm.layouts.Article;
      async.times(numModels, function(i, cb) {
        var m = cm.model.create(layout.name, data);
        m.data.title = m.data.title + ' ' + i;
        cm.model.save(m, function(err, m) {
          if (err) cb(err);
          else {
            models.push(m);
            cb();
          }
        });
      }, done);
    });

    after(function(done) {
      async.each(models, function(m, cb) {
        cm.model.destroy(m.id, m.rev, cb);
      }, done);
    });
    
    it('should have the standard all view', function(done) {
      cm.view(layout.name, 'all', function(err, docs) {
        expect(err).to.not.exist;
        expect(docs).to.be.a('array');
        expect(docs.length).to.equal(numModels);
        expect(docs[0]).to.be.a('object');

        var model = docs[0];
        expect(model).to.have.property('id');
        expect(model).to.have.property('rev');
        expect(model).to.have.property('type');
        expect(model.data).to.be.a('object');
        expect(model.data._id).to.not.exist;
        expect(model.data._rev).to.not.exist;
        expect(model.data.type).to.not.exist;
        done();
      });
    });

    it('should call the custom view', function(done) {
      cm.view(layout.name, 'titles', function(err, docs) {
        expect(err).to.not.exist;
        expect(docs).to.be.a('array');
        expect(docs.length).to.equal(numModels);
        expect(docs[0]).to.be.a('string');
        done();
      });
    });
  });
  
});