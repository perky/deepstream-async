"use strict";

class DeepstreamAsync {
  constructor( dsClient, options ) {
    this.client = dsClient;
    this.options = options;
    this.record = new DsRecordAsync(dsClient);
    this.rpc = new DsRpcAsync(dsClient);
    this.client.on('error', ( error, event, topic ) => console.log(error, event, topic));
  }

  login( options ) {
    return new Promise((resolve, reject) => {
      this.client.login(options, (success, data) => {
        if (success)
          resolve(data);
        else
          reject(data);
      });
    });
  }

  genUid() {
    return this.client.getUid();
  }

  genRecordId( table ) {
    return `${table}/${this.genUid()}`;
  }
}

class DsRpcAsync {
  constructor( dsClient ) {
    this.client = dsClient;
  }

  genProgressEvent( startingValue ) {
    let progressEventId = `progress_event/${this.client.getUid()}`;
    let progress = {id: progressEventId, value: startingValue||0};
    this.updateProgressEvent(progress, progress.value);
    return progress;
  }

  updateProgressEvent( progress, newValue ) {
    progress.value = newValue;
    this.client.event.emit(progress.id, progress.value);
  }

  provide( id ) {
    return this.client.rpc.provide(id, callback);
  }

  unprovide( id ) {
    return this.client.rpc.unprovide(id);
  }

  call( id, rpcArgs ) {
    return new Promise((resolve, reject) => {
      this.client.rpc.make(id, rpcArgs, (error, response) => {
        if (error)
          reject(error);
        else
          resolve(response);
      });
    })
  }
}

class DsRecordAsync {
  constructor( dsClient ) {
    this.client = dsClient;
  }

  _recordPromise( rid, fnName ) {
    return new Promise((resolve, reject) => {
      let record = this.client.record[fnName](rid);
      record.whenReady(r => resolve(r));
      record.on('error', err => reject(err));
    });
  }
  
  _getRecord( rid ) {
    return this._recordPromise(rid, 'getRecord');
  }

  _getList( rid ) {
    return this._recordPromise(rid, 'getList');
  }

  _getSnapshot( rid ) {
    return new Promise((resolve, reject) => {
      this.client.record.snapshot(rid, (err, data) => {
        if (err)
          reject(err);
        else
          resolve(data);
      });
    });
  }
  
  /**
   * Promise version of record.getRecord
   * 
   * @param {any} rid - Record ID
   * @param {any} options - pass 'mustExist:true' to throw an error if the record does not exist.
   * @returns a record
   * 
   * @memberOf DsRecordAsync
   */
  getRecord( rid, options ) {
    options = options || {};
    if (options.mustExist) {
      return this.exists(rid, {rejectOnFalse:true}).then(() => {
        return this._getRecord(rid);  
      });
    } else {
      return this._getRecord(rid);
    }
  }
  
  /**
   * Promise version of record.snapshot
   * 
   * @param {any} rid - Record ID
   * @returns a snapshot of the record, will throw an error if it does not exist
   * 
   * @memberOf DsRecordAsync
   */
  getSnapshot( rid ) {
    return this._getSnapshot(rid);
  }
  
  /**
   * Promise version of record.getList
   * 
   * @param {any} rid - Record ID 
   * @returns list - record
   * 
   * @memberOf DsRecordAsync
   */
  getList( rid ) {
    return this._getList(rid);
  }

  /**
   * Checks if a record exists
   * 
   * @param {any} rid - Record ID
   * @param {any} options - pass 'rejectOnFalse:true' to throw an error if the record does not exist.
   * @returns true if the record exists, false if not (unless rejectOnFalse is set to true)
   * 
   * @memberOf DsRecordAsync
   */
  exists( rid, options ) {
    options = options || {};
    return new Promise((resolve, reject) => {
      this.client.record.has(rid, (err, bExists) => {
        if (err)
          reject(err);
        else if (options.rejectOnFalse && !bExists)
          reject(`exists(): Record ${rid} does not exist.`);
        else
          resolve(bExists);
      });
    });
  }
  
  /**
   * Joins all the recordIds inside a list.
   * 
   * @param {any} list - the list to join.
   * @param {any} options - pass 'snapshot:true' to get a snapshot of records instead,
   *  pass 'joinFields:[field1, fieldN]' to join those fields on each document. 
   * @returns An array of records.
   * 
   * @memberOf DsRecordAsync
   */
  joinList( list, options ) {
    options = options || {};
    let jobs = [];
    let entries = list.getEntries();
    for (let i = 0; i < entries.length; i++) {
      let job = options.snapshot ? this._getSnapshot(entries[i]) : this._getRecord(entries[i]);
      if (options.progress) {
        job.then(()=>{
          options.progress(i, entries.length);
        });
      }
      jobs.push(job);
    }

    let jobsDone = Promise.all(jobs);
    if (options.joinFields) {
      return jobsDone.then((jobResults) => {
        let jobs = [];
        let result = [];
        for (let i = 0; i < jobResults.length; i++) {
          let record = {};
          record.left = jobResults[i];
          let job = this.joinFields(record.left, options.joinFields, options).then(right => {
            record.right = right;
          });
          result.push(record);
          jobs.push(job);
        }
        return Promise.all(jobs).then(jobResults => {
          return result;
        });
      });
    }
    return jobsDone;
  }
  
  /**
   * Retreives a field's value using dot notation.
   * For example 'files.config.a'
   * 
   * @param {any} recordData - the record data object (not the record cursor itself)
   * @param {any} pathStr - the field path, using dot notation.
   * @returns the fields value
   * 
   * @memberOf DsRecordAsync
   */
  getField( recordData, pathStr ) {
    if (pathStr === '') return recordData;
    let path = pathStr.split('.');
    let field = recordData;
    for (let i = 0; i < path.length; i++) {
      if (field[path[i]]) {
        field = field[path[i]];
      } else {
        return undefined;
      }
    }
    return field;
  }

  /**
   * Sets a field's value using dot notation.
   * For example 'files.config.a'
   * 
   * @param {any} recordData - the record data object (not the record cursor itself)
   * @param {any} pathStr - the field path, using dot notation.
   * @param {any} value - the value to set.
   * 
   * @memberOf DsRecordAsync
   */
  setField( recordData, pathStr, value ) {
    let path = pathStr.split('.');
    let field = path.pop();
    let container = this.getField(recordData, path.join('.'));
    container[field] = value;
  }

  
  /**
   * Joins a bunch of fields on a record and returns those in a seperate object.
   * 
   * @param {any} recordData
   * @param {any} targetFields
   * @param {any} options - set 'snapshot:true' to retreive snapshots.
   * @returns
   * 
   * @memberOf DsRecordAsync
   */
  joinFields( recordData, targetFields, options ) {
    options = options || {};
    let jobs = [];
    let result = {};
    for (let i = 0; i < targetFields.length; i++) {
      let rid = this.getField(recordData, targetFields[i]);
      let recordJob = options.snapshot ? this._getSnapshot(rid) : this._getRecord(rid);
      let job = recordJob.then(data => {
        result[targetFields[i]] = data;
      });
      jobs.push(job);
    }
    return Promise.all(jobs).then(() => { return result; });
  }
}

module.exports = DeepstreamAsync;
