module.exports = {

  create: function(res, doc, callback) {
    doc.createHook = res.createOption;
    callback(null, doc);
  },

  load: function(res, doc, callback) {
    doc.loadHook = res.loadOption;
    callback(null, doc);
  },
  
  save: function(res, doc, callback) {
    doc.saveHook = res.saveOption;
    callback(null, doc);
  }
};