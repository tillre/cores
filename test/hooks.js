module.exports = function(comodl) {

  return {
    save: function(doc, callback) {
      doc.hooky = 'Added in hook';
      callback(null, doc);
    }
  };
  
};