module.exports = {

  views: {
    all: {
      map: function(doc) {
        if (doc.type === 'Article') {
          emit(doc._id);
        }
      }
    }
  }

  
};