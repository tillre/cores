/*global before after describe it*/

var expect = require('chai').expect;
var nano = require('nano')('http://localhost:5984');
var moskito = require('./index');

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
  
  describe('model', function() {
    var m = null;
    it('should create a model', function() {
	  m = mos.createModel('foobar', {
        properties: {
          foo: {type: 'string'},
          bar: {type: 'number'}
        }
      });
      expect(m).to.not.be.undefined;
      expect(m).to.not.be.null;
      expect(m.name).to.be.equal('foobar');
    });
	it('should validate data set on the model', function() {
      var err = null;
      m.setData({foo: '', bar: 42}, function(e) { err = e; });
      expect(err).to.be.null;
      m.setData({foo: '', bar: ''}, function(e) { err = e; });
      expect(err).to.not.be.null;
	});
    it('should save the model', function(done) {
      m.save(done);
    });
    it('should destroy the model', function(done) {
      m.destroy(done);
    });
  });
});

