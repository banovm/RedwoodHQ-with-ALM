var common = require('../common');
var db;
var https = require('https');
var LWSSO_Cookie = "";
var QCSession_Cookie = "";
var parser = "";

var authheader;
var almServer;
var almDomain;
var almProject;

exports.Post = function(req, res){
	var data = req.body;
	//initALM(data.almPath, data.testName, function(status, message){
	initALM('testcase', data, function(status, message){
		res.contentType('json');
        res.json({success:true, status:status, message:message});
	});
};

exports.uploadTestResultsToALM = function(testData){
	initALM('testset', testData, function(status, message){
		if(status){
			common.logger.info('Test set results have been uploaded: ' + JSON.stringify(testData));
		}else{
			common.logger.error('Test set results have NOT been uploaded: ' + message);
		}
	});
};

function initALM(testCaseOrTestSet, testData, callback){
	db = common.getDB();
	db.collection('almsettings', function(err, collection) {
		collection.findOne({}, {}, function(err, settings) {
			if(!settings.almserver) return;
			almServer = settings.almserver;
			almDomain = settings.almdomain;
			almProject = settings.almproject;
			authheader = new Buffer(settings.almuser+':'+settings.almpassword).toString('base64');
			
			var options = {
				host : almServer,
				path : '/qcbin/authentication-point/authenticate',
				method: 'POST',
				headers : {'Authorization': 'Basic '+ authheader}
			};
			
			//authenticating the user into ALM - LWSSO_Cookie
			ALMConnect(options, 'header','', function(status, data){
				if(status){
					//get the LWSSO_Cookie from the header. This is the session cookie which will be used in all callouts to ALM.
					if(data.headers["set-cookie"] != undefined ) {
						var array = data.headers["set-cookie"];
						LWSSO_Cookie = array[0];
						getQCSessionCookie(testCaseOrTestSet, testData, callback);
					}else{
						callback(false, 'Upload Test Case to ALM: ERROR: Unable to login, check your username/password/serverURL/path.');
						//common.logger.error('Upload Test Case to ALM: ERROR:  Unable to login, check your username/password/serverURL/path.');
					}
				}else{
					callback(false, 'Upload Test Case to ALM: Authenticate ERROR: ' + data);
					//common.logger.error('Upload Test Case to ALM: Authenticate ERROR: ' + JSON.stringify(data));
				}
			});
			
		});
	});
}

function getQCSessionCookie(testCaseOrTestSet, testData, callback){

	//parser = JSON.parse(testData);
	parser = testData;

	var options = {
		host : almServer,
		path : '/qcbin/rest/site-session',
		method: 'POST',
		headers : {'Cookie':LWSSO_Cookie, 'Path':'/'}
	};

	//authenticating the user into ALM - QCSession
	ALMConnect(options, 'header','', function(status, data){
		if(status){
			if(data.headers["set-cookie"] != undefined ) {
				var array = data.headers["set-cookie"];
				QCSession_Cookie = array[0];
				
				//upload a test case
				if(testCaseOrTestSet == 'testcase'){
				
					var testPath = parser.almPath;
					var testName = parser.testName;
					findQCFolderID(testPath, 0, function(status, data){
						if(status){
							uploadTestCaseToALM(testName, data, function(status, data){
								if(status){
									var dataMessage = JSON.stringify(data);
									/*var fieldsparser = JSON.parse(data);
									var fieldsarray = fieldsparser.Fields;
									
									common.logger.info('dataMessage: '+dataMessage);
									common.logger.info('dataparser: '+dataparser);
									common.logger.info('data: '+data);*/
									if (dataMessage.indexOf('Duplicate Test') == -1){
										callback(true, 'Upload was successful: '+data);
									}else{
										callback(false, 'Test case has already been uploaded to test path');
									}
								}else{
									callback(false, 'Upload was NOT successful, error occurred in upload operation: '+ data);
									//common.logger.error('create ERROR: ' + JSON.stringify(data));
								}
							});
						}else{
							callback(false, 'Upload was NOT successful, error occurred when finding test folder ID: '+ data);
							//common.logger.error('Upload Test Case to ALM: Authenticate ERROR: ' + JSON.stringify(data));
						}
					});
					
				//upload a test set result
				}else{
					
					//find test set folder ID
					var testSetPath = parser.testSetPath;
					findQCTestSetFolderID(testSetPath, -1, function(status, data){
						if(status){
							
							//find test set ID
							var testSet = parser.testSet;
							common.logger.info('test set name: '+testSet);
							common.logger.info('parent-id: '+data);
							var asd = "/qcbin/rest/domains/"+almDomain+"/projects/"+almProject+"/test-sets?query={parent-id["+data+"];name["+testSet+"]}";
							common.logger.info("query: "+asd);
							
							options = {
								host : almServer,
								path : "/qcbin/rest/domains/"+almDomain+"/projects/"+almProject+"/test-sets?query={parent-id["+data+"];name["+testSet+"]}",
								method: 'GET',
								headers: {
									'Cookie':LWSSO_Cookie+';'+QCSession_Cookie,
									'Accept':'application/json',
									'Content-Type':'application/json'
								}
							};
							
							ALMConnect(options, 'data','',function(status,data){
								if(status){
									var testSetParser = JSON.parse(data);
									if(testSetParser.TotalResults != 0){
										var testSetID = testSetParser.entities[0].Fields[4].values[0].value;
										
										//find test instance ID
										var testInstance = parser.testInstance;
										
										options = {
											host : almServer,
											path : "/qcbin/rest/domains/"+almDomain+"/projects/"+almProject+"/test-instances?query={cycle-id["+testSetID+"]}",
											method: 'GET',
											headers: {
												'Cookie':LWSSO_Cookie+';'+QCSession_Cookie,
												'Accept':'application/json',
												'Content-Type':'application/json'
											}
										};
										
										ALMConnect(options, 'data','',function(status,data){
											if(status){
												var testInstanceParser = JSON.parse(data);
												if(testInstanceParser.TotalResults != 0){
													var index,len,testInstanceName,testInstanceID,testID,owner;
													testInstanceID = -1;
													common.logger.info(testInstanceParser);
													for(index = 0; index < testInstanceParser.entities.length; ++index){
														testInstanceName = testInstanceParser.entities[index].Fields[11].values[0].value;
														common.logger.info('test instance name: '+testInstanceName);
														if(testInstanceName == testInstance+' [1]'){
															testInstanceID = testInstanceParser.entities[index].Fields[5].values[0].value;
															common.logger.info('test instance id: '+testInstanceID);
															testID = testInstanceParser.entities[index].Fields[27].values[0].value;
															common.logger.info('test id: '+testID);
															owner = testInstanceParser.entities[index].Fields[30].values[0].value;
															common.logger.info('owner: '+owner);
															break;
														}
													}
													if(testInstanceID != -1){
														
														//create new run for test instance
														uploadTestRunResultsToALM(testInstanceID, testID, owner, testData, function(status, data){
															if(status){
																var dataMessage = JSON.stringify(data);
																
																//update test instance with latest run
																updateTestInstanceInALM(testInstanceID, testData, function(status, data){
																	if(status){
																		common.logger.info('update test instance: '+data);
																		callback(true, 'Results upload was successful: ' + dataMessage);
																	}else{
																		callback(false, 'Results upload was NOT successful, error occurred in upload operation: '+ dataMessage);
																	}
																});
															}else{
																callback(false, 'Results upload was NOT successful, error occurred updating test instance: '+ dataMessage);
															}
														});
														
														
													}else{
														callback(false,'ERROR: ' + data);
													}
												}else{
													callback(false,'ERROR: ' + data);
												}
											}else{
												callback(false,'ERROR: ' + data);
											}
										});
									}else{
										callback(false, 'Invalid test set folder path')
									}
								}else{
									callback(false,'ERROR: ' + data);
								}
							});
						}else{
							callback(false, 'Upload was NOT successful, error occurred when finding test set folder ID: '+ data);
						}	
					});
				}
			}else{
				callback(false, 'Upload to ALM: ERROR: Unable to login, check your username/password/serverURL/path.');
			}
		}else{
			callback(false, 'Upload to ALM: Authenticate ERROR: ' + data);
		}
	});
}

//given folder path in QC, return ID value for test folder
//folder path example: Subject;Testing;Redwood
function findQCFolderID(folderPath, parentID, callback){
	var folder = "";
	var folderID = "";
	var remainingFolders = "";
	
	if (folderPath.indexOf(';') == -1) {
		folder = folderPath;
	} else {
		folder = folderPath.substring(0,folderPath.indexOf(';'));
		remainingFolders = folderPath.substring(folderPath.indexOf(';')+1,folderPath.length);
	}
	
	//retrieve folder ID for Subject
	var options = {
		host: almServer,
		path: "/qcbin/rest/domains/"+almDomain+"/projects/"+almProject+"/test-folders?query={name["+folder+"];parent-id["+parentID+"]}",
		method:'GET',
		headers: {
			'Cookie':LWSSO_Cookie+';'+QCSession_Cookie,
			'Accept':'application/json',
			'Content-Type':'application/json'
		}
	};
	
	ALMConnect(options, 'data','',function(status,data){
		if(status){
			var qcFolderParser = JSON.parse(data);
			if(qcFolderParser.TotalResults != 0){
				folderID = qcFolderParser.entities[0].Fields[1].values[0].value;
				if (remainingFolders == "") {
					callback(true, folderID);
				} else {
					findQCFolderID(remainingFolders, folderID, callback);
				}
			}else{
				callback(false, 'Invalid test folder path')
			}
		}else{
			callback(false,'ERROR: ' + data);
		}
	});
}

//given test set folder path in QC, return ID value for test set folder
//folder path example: Root;Testing;Redwood
function findQCTestSetFolderID(folderPath, parentID, callback){
	var folder = "";
	var folderID = "";
	var remainingFolders = "";
	
	if (folderPath.indexOf(';') == -1) {
		folder = folderPath;
	} else {
		folder = folderPath.substring(0,folderPath.indexOf(';'));
		remainingFolders = folderPath.substring(folderPath.indexOf(';')+1,folderPath.length);
	}
	
	//retrieve folder ID for Subject
	var options = {
		host: almServer,
		path: "/qcbin/rest/domains/"+almDomain+"/projects/"+almProject+"/test-set-folders?query={name["+folder+"];parent-id["+parentID+"]}",
		method:'GET',
		headers: {
			'Cookie':LWSSO_Cookie+';'+QCSession_Cookie,
			'Accept':'application/json',
			'Content-Type':'application/json'
		}
	};
	
	ALMConnect(options, 'data','',function(status,data){
		if(status){
			var testSetFolderParser = JSON.parse(data);
			common.logger.info('testsetfolder: '+JSON.stringify(data));
			common.logger.info('TOTALRESULTS: '+testSetFolderParser.TotalResults);
			if(testSetFolderParser.TotalResults != 0){
				common.logger.info('GOT INSIDE');
				folderID = testSetFolderParser.entities[0].Fields[0].values[0].value;
				common.logger.info('folderID: '+folderID);
				if (remainingFolders == "") {
					callback(true, folderID);
				} else {
					findQCTestSetFolderID(remainingFolders, folderID, callback);
				}
			}else{
				callback(false, 'Invalid test set folder path')
			}
		}else{
			callback(false,'ERROR: ' + data);
		}
	});
}

function uploadTestCaseToALM(name, parentID, callback){
	var options = {
		host: almServer,
		path: "/qcbin/rest/domains/"+almDomain+"/projects/"+almProject+"/tests",
		method:'POST',
		headers: {
			'Cookie':LWSSO_Cookie+';'+QCSession_Cookie,
			'Accept':'application/json',
			'Content-Type':'application/json'
		}
	};
	
	var body = '{"Fields":[{"Name":"name","values":[{"value":"'+name+'"}]},{"Name":"subtype-id","values":[{"value":"VAPI-XP-TEST"}]},{"Name":"parent-id","values":[{"value":"'+parentID+'"}]}]}';
 
	ALMConnect(options, 'data',body,function(status,data){
		callback(status,data);
	});
}

function uploadTestRunResultsToALM(testInstanceID, testID, owner, testData, callback){
	common.logger.info('inside uploadTestRunResultsToALM');
	
	//parser = JSON.parse(testData);
	var uploadParser = testData;
	var timestamp = uploadParser.execTimeStamp;
	var errorTrace = uploadParser.errorTrace;
	var status = uploadParser.status;
	if(status == "Finished"||status == "Passed"){
		status = "Passed";
		errorTrace = "No errors";
	}
	var duration = parseInt(uploadParser.duration);
	
	if(errorTrace === "undefined"){
		errorTrace = "No errors";
	}
	
	var date = new Date(timestamp);
	
	var runName = date.getFullYear()+' '+date.getHours()+':'+date.getMinutes()+':'+date.getSeconds();
	var executionDate = date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate();
	var executionTime = date.getHours()+':'+date.getMinutes()+':'+date.getSeconds();
	var finalDuration = parseInt((duration / 1000) >> 0);
	
	var options = {
		host: almServer,
		path: "/qcbin/rest/domains/"+almDomain+"/projects/"+almProject+"/runs",
		method:'POST',
		headers: {
			'Cookie':LWSSO_Cookie+';'+QCSession_Cookie,
			'Accept':'application/json',
			'Content-Type':'application/json'
		}
	};
	
	var body = '{"Fields":[{"Name":"name","values":[{"value":"'+runName+'"}]},{"Name":"subtype-id","values":[{"value":"hp.qc.run.VAPI-XP-TEST"}]},{"Name":"testcycl-id","values":[{"value":"'+testInstanceID+'"}]},{"Name":"status","values":[{"value":"'+status+'"}]},{"Name":"duration","values":[{"value":"'+finalDuration+'"}]},{"Name":"execution-date","values":[{"value":"'+executionDate+
	'"}]},{"Name":"execution-time","values":[{"value":"'+executionTime+'"}]},{"Name":"test-id","values":[{"value":"'+testID+'"}]},{"Name":"owner","values":[{"value":"'+owner+'"}]},{"Name":"comments","values":[{"value":"Error trace: '+errorTrace+'\\nExec date: '+executionDate+'\\nExec time: '+executionTime+'"}]}]}';
 
	ALMConnect(options, 'data',body,function(status,data){
		callback(status,data);
	});
}

function updateTestInstanceInALM(testInstanceID, testData, callback){

	//parser = JSON.parse(testData);
	var uploadParser = testData;
	var timestamp = uploadParser.execTimeStamp;
	var status = uploadParser.status;
	if(status == "Finished"){
		status = "Passed";
	}
	var date = new Date(timestamp);
	var executionDate = date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate();
	var executionTime = date.getHours()+':'+date.getMinutes()+':'+date.getSeconds();
	
	var options = {
		host: almServer,
		path: "/qcbin/rest/domains/"+almDomain+"/projects/"+almProject+"/test-instances?query={id["+testInstanceID+"]}",
		method:'PUT',
		headers: {
			'Cookie':LWSSO_Cookie+';'+QCSession_Cookie,
			'Accept':'application/json',
			'Content-Type':'application/json'
		}
	};
	
	var body = '{"Fields":[{"Name":"status","values":[{"value":"'+status+'"}]},{"Name":"exec-date","values":[{"value":"'+executionDate+
	'"}]},{"Name":"exec-time","values":[{"value":"'+executionTime+'"}]}]}';
 
	ALMConnect(options, 'data',body,function(status,data){
		callback(status,data);
	});
}

function ALMConnect(opt, responseType,requestBody, callback){
 
    var request = https.request(opt, function(res){
        res.setEncoding('utf8');
        var XMLoutput='';
        res.on('data',function(chunk){
            XMLoutput+=chunk;
        });
        res.on('end',function(){
            if(responseType=='data'){
                callback(true,XMLoutput);
            }else {
                callback(true, res);
            }
        });
    });
    request.on('error',function(e){
        callback(false,e);
    });
    if(opt.method=='POST' || opt.method == 'PUT'){
        request.write(requestBody);
    }
    request.end();
}