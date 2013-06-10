module.exports = {

  load: function(app, doc, callback) {
    app.loadHook = true;
    callback(null, doc);
  },
  
  save: function(app, doc, callback) {
    app.saveHook = true;
    callback(null, doc);
  },

  destroy: function(app, doc, callback) {
    app.destroyHook = true;
    callback(null, doc);
  }
};