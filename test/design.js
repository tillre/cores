var async = require('async');


module.exports = {

  views: {
    all: {
      map: function(doc) {
        if (doc.type === 'Article') {
          emit(doc._id, doc);
        }
      },
      layout: function(mosi, result, cb) {
        async.map(result.rows,
                  function(data, cb2) {
                    mosi.model.create('Article', data.value, cb2);
                  },
                  cb);
      }
    }
  }
  
};