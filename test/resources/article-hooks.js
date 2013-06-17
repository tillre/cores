var assert = require('assert');


module.exports = {

  read: function(doc, callback) {
    assert(this.name === 'Article');
    this.app.loadHook = true;
    callback(null, doc);
  },
  
  create: function(doc, callback) {
    assert(this.name === 'Article');
    this.app.createHook = true;
    callback(null, doc);
  },

  update: function(doc, callback) {
    assert(this.name === 'Article');
    this.app.updateHook = true;
    callback(null, doc);
  },

  destroy: function(doc, callback) {
    assert(this.name === 'Article');
    this.app.destroyHook = true;
    callback(null, doc);
  }
};