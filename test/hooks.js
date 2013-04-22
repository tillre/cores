module.exports = {

  create: function(doc, callback) {
    doc.createHook = true;
    callback(null, doc);
  },

  save: function(doc, callback) {
    doc.saveHook = true;
    callback(null, doc);
  }
};