/*global before after describe it*/

var expect = require('chai').expect;
var nano = require('nano')('http://localhost:5984');
var moskito = require('../');

describe('moskito', function() {

  var dbName = 'moskito-test',
      db = nano.use(dbName),
      mos = moskito(nano.use(dbName));

  
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

  describe('model with schema', function() {
    var model = null,
        schema =  {
          name: 'foobar',
          properties: {
            foo: {type: 'string'},
            bar: {type: 'number'}
          }
        };

    it('should be created', function(done) {
	  mos.createModel(schema, function(err, m) {
        model = m;
        expect(model).to.exist;
        expect(model.name).to.be.equal('foobar');
        done(err);
      });
    });

    it('should allow valid data', function(done) {
      model.setData({foo: '', bar: 42}, function(err) {
        expect(err).to.not.exist;
        done();
      });
    });

    it('should not allow invalid data', function(done) {
      model.setData({foo: '', bar: ''}, function(err) {
        expect(err).to.exist;
        done();
      });
    });

    it('should save', function(done) {
      model.save(done);
    });

    it('should be destroyed', function(done) {
      model.destroy(done);
    });
  });

  describe('model with schema and design', function() {
    var schema = require('./schema');
    var design = require('./design');
    var model = null,
        modelId = null;
    
    it('should be created', function(done) {
      mos.createModel(schema, design, function(err, m) {
        expect(m).to.be.a('object');
        model = m;
        done(err);
      });
    });

    it('should validate setting data', function(done) {
      var data = require('./data');
      model.setData(data, done);
    });

    it('should save', function(done) {
      model.save(done);
    });
    
    it('should update', function(done) {
      model.data.title = 'The New Title';
      model.save(done);
    });

    it('should no update when not validating', function(done) {
      var oldTitle = model.data.title;
      model.data.title = 35;
      model.save(function(err) {
        expect(err).to.exist;
        model.data.title = oldTitle;
        done();
      });
    });
    
    it('should be loadable by id', function(done) {
      var m = mos.createModel(schema, design, function(err, m) {
        if (err) done(err);
        else {
          m.load(model.id, function(err) {
            expect(err).to.not.exist;
            expect(model.id === m.id);
            done();
          });
        }
      });
    });

    it('should be destroyed', function(done) {
      modelId = model.id;
      model.destroy(done);
    });
    
    it('should not load when not existant', function(done) {
      model.load(modelId, function(err) {
        expect(err).to.exist;
        done();
      });
    });
  });
});

