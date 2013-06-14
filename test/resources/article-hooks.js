var assert = require('assert');


module.exports = {

  load: function(doc, callback) {
    assert(this.name === 'Article');
    this.app.loadHook = true;
    callback(null, doc);
  },
  
  save: function(doc, callback) {
    assert(this.name === 'Article');
    this.app.saveHook = true;
    callback(null, doc);
  },

  destroy: function(doc, callback) {
    assert(this.name === 'Article');
    this.app.destroyHook = true;
    callback(null, doc);
  }
};