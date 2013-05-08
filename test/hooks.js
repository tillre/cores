module.exports = {

  create: function(app, doc, callback) {
    doc.createHook = app.createOption;
    callback(null, doc);
  },

  load: function(app, doc, callback) {
    doc.loadHook = app.loadOption;
    callback(null, doc);
  },
  
  save: function(app, doc, callback) {
    doc.saveHook = app.saveOption;
    callback(null, doc);
  }
};