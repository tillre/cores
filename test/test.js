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
    
    it('should create', function(done) {
      cm.model.create(layout.name, function(err, m) {
        model = m;
        done(err);
      });
    });

    it('should not be valid without data', function(done) {
      cm.model.validate(model, function(err) {
        expect(err).to.exist;
        done();
      });
    });

    it('should not save when not valid', function(done) {
      cm.model.save(model, function(err) {
        expect(err).to.exist;
        done();
      });
    });
    
    it('should be valid after setting data', function(done) {
      model.data = data;
      cm.model.validate(model, done);
    });

    it('should save when valid', function(done) {
      cm.model.save(model, done);
    });

    it('should load', function(done) {
      cm.model.load(model.id, function(err, m2) {
        expect(err).to.not.exist;
        expect(m2).to.exist;
        expect(JSON.stringify(m2.data) === JSON.stringify(model.data));
        done();
      });
    });

    it('should destroy', function(done) {
      cm.model.destroy(model, done);
    });
  });

  
  describe('layout views', function() {
    var layout = null,
        numModels = 3;

    before(function(done) {
      // depends on the layout tests
      layout = cm.layouts.Article;
      async.times(numModels, function(i, cb) {
        cm.model.create(layout.name, data, function(err, m) {
          m.data.title = m.data.title + ' ' + i;
          cm.model.save(m, cb);
        });
      }, done);
    });

    it('should call the view', function(done) {
      cm.view(layout.name, 'all', function(err, models) {
        expect(err).to.not.exist;
        expect(models).to.be.a('array');
        expect(models.length).to.equal(numModels);
        done();
      });
    });
  });
  
});