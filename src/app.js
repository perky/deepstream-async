const deepstream = require('deepstream.io-client-js');
const deepstreamAsync = require('./src/ds_async');
var client = new deepstreamAsync(deepstream('localhost:6021'));
client.login({username:'test'}).then(app).catch(err => console.log(err));

async function app() {
  console.log('app');
  
  let list = await client.record.getList('my_list');

  // for (let i = 0; i < 30; i++) {
  //   let record = await client.record.getRecord(client.genRecordId('test'));
  //   record.set('number', i);
  //   let otherRecord = await client.record.getRecord(client.genRecordId('other'));
  //   otherRecord.set('field', i*2);
  //   record.set('sibling', otherRecord.name);
  //   list.addEntry(record.name);
  //   record.discard();
  //   otherRecord.discard();
  // }

  let listEntries = await client.record.joinList(list, {snapshot:true});
  //console.log(listEntries.length);

}