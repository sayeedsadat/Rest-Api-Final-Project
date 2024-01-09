const {Datastore} = require('@google-cloud/datastore');

module.exports.Datastore = Datastore;
module.exports.datastore = new Datastore();
module.exports.fromDatastore = function fromDatastore(item){
    item.id = parseInt(item[Datastore.KEY].id, 10);
    return item;
}