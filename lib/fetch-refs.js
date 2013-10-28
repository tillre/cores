var Q = require('kew');
var common = require('./common.js');


//
// collect all ref objs and ref ids from a document
//
function addRefs(doc, refs) {

  common.walkObject(doc, function(obj, key, value) {

    if (value && typeof value === 'object' && value.id_) {
      if (!refs.objs[value.id_]) {
        refs.objs[value.id_] = [value];
      }
      else {
        refs.objs[value.id_].push(value);
      }
      refs.ids.push(value.id_);
    }
  });
}


module.exports = function fetchRefs(cores, docs) {

  var refs = { objs: {}, ids: [] };
  docs.forEach(function(doc) {
    addRefs(doc, refs);
  });
  if (refs.ids.length === 0) return Q.resolve(docs);

  return cores.fetch(refs.ids).then(function(result) {
    // merge docs into ref objects
    result.rows.forEach(function(row) {
      refs.objs[row.id].forEach(function(ref) {
        common.merge(ref, row.doc);
      });
    });
    return docs;
  });
};
