var util = require('util');
var Q = require('kew');


function merge(a, b) {
  for (var n in b) {
    a[n] = b[n];
  }
}

function walkObject(obj, iterator) {

  for (var key in obj) {
    walk(obj, key);
  }

  function walk(obj, key) {

    var value = obj[key];
    var r = iterator(obj, key, value);
    if (typeof r === 'boolean' && !r) return;

    if (util.isArray(value)) {
      for (var i = 0; i < value.length; ++i) {
        walk(value, i);
      }
    }
    else if (value && typeof value === 'object') {
      for (var m in value) {
        walk(value, m);
      }
    }
  }
};


//
// collect all ref objs and ref ids from a document
//
function addRefs(doc, refs) {

  walkObject(doc, function(obj, key, value) {

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
    // merge docs into refs
    result.rows.forEach(function(row) {
      refs.objs[row.id].forEach(function(ref) {
        merge(ref, row.doc);
      });
    });
    return docs;
  });
};
