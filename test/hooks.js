module.exports = {

  create: function(res, doc, callback) {
    doc.createHook = res.createOption;
    callback(null, doc);
  },

  save: function(res, doc, callback) {
    doc.saveHook = res.saveOption;
    callback(null, doc);
  }
};