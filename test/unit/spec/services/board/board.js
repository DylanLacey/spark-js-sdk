/**!
 *
 * Copyright (c) 2015-2016 Cisco Systems, Inc. See LICENSE file.
 */

'use strict';

var chai = require('chai');
var Board = require('../../../../../src/client/services/board');
var MockSpark = require('../../../lib/mock-spark');
var sinon = require('sinon');

var assert = chai.assert;
sinon.assert.expose(chai.assert, {prefix: ''});

describe('Services', function() {
  describe('Board', function() {
    var spark;
    var encryptedData = 'encryptedData';
    var decryptedText = 'decryptedText';
    var fakeURL = 'fakeURL';
    var file = 'dataURL://base64;';

    var channel = {
      channelId: 'boardId',
      channelUrl: '/channels/boardId',
      aclUrlLink: 'aclUrlLink',
      defaultEncryptionKeyUrl: 'key'
    };

    before(function() {
      spark = new MockSpark({
        children: {
          board: Board
        },
        device: {
          deviceType: 'FAKE_DEVICE'
        },
        encryption: {
          decryptText: sinon.stub().returns(Promise.resolve(decryptedText)),
          encryptText: sinon.stub().returns(Promise.resolve(encryptedData)),
          encryptBinary: sinon.stub().returns(Promise.resolve({
            cblob: encryptedData,
            scr: {}
          })),
          download: sinon.stub().returns(Promise.resolve({
            toArrayBuffer: sinon.stub()
          })),
          decryptScr: sinon.stub().returns(Promise.resolve('decryptedFoo')),
          encryptScr: sinon.stub().returns(Promise.resolve('encryptedFoo'))
        },
        request: sinon.stub().returns(Promise.resolve()),
        client: {
          upload: sinon.stub().returns(Promise.resolve())
        }
      });
    });

    describe('#children', function() {

      it('has a child of persistence', function() {
        assert.isDefined(spark.board.persistence);
      });

      it('has a child of realtime', function() {
        assert.isDefined(spark.board.realtime);
      });
    });

    describe('#_uploadImage()', function() {

      before(function() {
        sinon.stub(spark.board, '_uploadImageToBoardSpace', sinon.stub().returns(Promise.resolve({
          downloadUrl: fakeURL
        })));
        return spark.board._uploadImage(channel, file);
      });

      after(function() {
        spark.board._uploadImageToBoardSpace.restore();
      });

      it('encrypts binary file', function() {
        assert.calledWith(spark.encryption.encryptBinary, file);
      });

      it('uploads to board space', function() {
        assert.calledWith(spark.board._uploadImageToBoardSpace, channel, encryptedData);
      });
    });

    describe('#_uploadImageToBoardSpace()', function() {

      afterEach(function() {
        spark.client.upload.reset();
      });

      it('uses length for upload filesize', function() {
        var blob = {
          length: 4444,
          size: 3333,
          byteLength: 2222
        };

        return spark.board._uploadImageToBoardSpace(channel, blob)
          .then(function() {
            assert.calledWith(spark.client.upload, sinon.match({
              phases: {
                initialize: {
                  fileSize: 4444
                },
                finalize: {
                  body: {
                    fileSize: 4444
                  }
                }
              }
            }));
          });
      });

      it('uses size for upload filesize when length is not available', function() {
        var blob = {
          size: 3333,
          byteLength: 2222
        };

        return spark.board._uploadImageToBoardSpace(channel, blob)
          .then(function() {
            assert.calledWith(spark.client.upload, sinon.match({
              phases: {
                initialize: {
                  fileSize: 3333
                },
                finalize: {
                  body: {
                    fileSize: 3333
                  }
                }
              }
            }));
          });
      });

      it('uses byteLenght for upload filesize when length and size are not available', function() {
        var blob = {
          byteLength: 2222
        };

        return spark.board._uploadImageToBoardSpace(channel, blob)
          .then(function() {
            assert.calledWith(spark.client.upload, sinon.match({
              phases: {
                initialize: {
                  fileSize: 2222
                },
                finalize: {
                  body: {
                    fileSize: 2222
                  }
                }
              }
            }));
          });
      });
    });

    describe('#encryptContents', function() {

      before(function() {
        sinon.stub(spark.board, 'encryptSingleContent').returns(Promise.resolve({
          encryptedData: encryptedData,
          encryptionKeyUrl: fakeURL
        }));
      });

      afterEach(function() {
        spark.board.encryptSingleContent.reset();
      });

      it('calls encryptSingleContent when type is not image', function() {

        var curveContents = [{
          type: 'curve'
        }];

        return spark.board.encryptContents(fakeURL, curveContents)
          .then(function(res) {
            assert.calledWith(spark.board.encryptSingleContent, fakeURL, curveContents[0]);
            assert.notCalled(spark.encryption.encryptScr);
            assert.equal(res[0].payload, encryptedData);
          });
      });

      it('calls encryptText and encryptScr when scr is found in content', function() {

        var imageContents = [{
          displayName: 'FileName',
          file: {
            scr: {
              loc: fakeURL
            }
          }
        }];

        return spark.board.encryptContents(fakeURL, imageContents)
          .then(function(encryptedFiles) {
            assert.calledWith(spark.encryption.encryptScr, {loc: fakeURL}, fakeURL);
            assert.calledWith(spark.encryption.encryptText, 'FileName', fakeURL);
            assert.equal(encryptedFiles[0].type, 'FILE');
            assert.property(encryptedFiles[0], 'file', 'file content must have file property');
          });
      });

      it('sets the device to config deviceType', function() {
        var curveContents = [{
          type: 'curve'
        }];

        return spark.board.encryptContents(fakeURL, curveContents)
          .then(function(res) {
            assert.equal(res[0].device, 'FAKE_DEVICE');
          });
      });
    });

    describe('#decryptContents', function() {

      before(function() {
        sinon.stub(spark.board, 'decryptSingleContent', sinon.stub().returns(Promise.resolve({})));
        sinon.spy(spark.board, 'decryptSingleFileContent');
      });

      after(function() {
        spark.board.decryptSingleContent.restore();
        spark.board.decryptSingleFileContent.restore();
      });

      afterEach(function() {
        spark.board.decryptSingleContent.reset();
        spark.board.decryptSingleFileContent.reset();
        spark.encryption.decryptScr.reset();
        spark.encryption.decryptText.reset();
      });

      it('calls decryptSingleContent when type is not image', function() {

        var curveContents = {
          items: [{
            type: 'STRING',
            payload: encryptedData,
            encryptionKeyUrl: fakeURL
          }]
        };

        return spark.board.decryptContents(curveContents)
          .then(function() {
            assert.calledWith(spark.board.decryptSingleContent, encryptedData, fakeURL);
            assert.notCalled(spark.encryption.decryptScr);
            assert.notCalled(spark.encryption.decryptText);
          });
      });

      it('calls decryptSingleFileContent when type is FILE', function() {

        var imageContents = {
          items: [{
            type: 'FILE',
            payload: JSON.stringify({
              type: 'image',
              displayName: 'encryptedDisplayName'
            }),
            file: {
              scr: 'encryptedScr',
            },
            encryptionKeyUrl: fakeURL
          }]
        };

        return spark.board.decryptContents(imageContents)
          .then(function() {
            assert.calledOnce(spark.board.decryptSingleFileContent);
            assert.calledWith(spark.encryption.decryptText, 'encryptedDisplayName', fakeURL);
            assert.calledWith(spark.encryption.decryptScr, 'encryptedScr', fakeURL);
          });
      });

      it('does not require payload when type is FILE', function() {
        var imageContents = {
          items: [{
            type: 'FILE',
            file: {
              scr: 'encryptedScr'
            },
            encryptionKeyUrl: fakeURL
          }]
        };

        return spark.board.decryptContents(imageContents)
          .then(function() {
            assert.calledOnce(spark.board.decryptSingleFileContent);
            assert.calledWith(spark.encryption.decryptText, undefined, fakeURL);
            assert.calledWith(spark.encryption.decryptScr, 'encryptedScr', fakeURL);
          });
      });
    });

    describe('#parseLinkHeaders', function() {

      it('returns empty object if there are not any link headers', function() {
        var linkHeader = undefined;
        assert.deepEqual(spark.board.parseLinkHeaders(linkHeader), {});
      });

      it('returns object containing one link if only one link header passed as a string', function() {
        var linkHeader = '<https://www.cisco.com>; rel=cisco';
        assert.deepEqual(spark.board.parseLinkHeaders(linkHeader), {
          cisco: 'https://www.cisco.com'
        });
      });

      it('returns object containing multiple links when multiple headers passed as an array', function() {
        var linkHeader = [
          '<https://www.ciscospark.com>; rel=ciscospark',
          '<https://www.cisco.com>; rel=cisco'
        ];
        assert.deepEqual(spark.board.parseLinkHeaders(linkHeader), {
          ciscospark: 'https://www.ciscospark.com',
          cisco: 'https://www.cisco.com'
        });
      });
    });

    describe('#boardChannelIdToMercuryBinding', function() {
      it('adds board. binding prefix', function() {
        assert.equal(spark.board.boardChannelIdToMercuryBinding('test'), 'board.test');
      });

      it('replaces `-` with `.` and `_` with `#`', function() {
        assert.equal(spark.board.boardChannelIdToMercuryBinding('abc-1234_bcd'), 'board.abc.1234#bcd');
      });

      it('leaves strings without - and _ alone', function() {
        assert.equal(spark.board.boardChannelIdToMercuryBinding('abcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()+='), 'board.abcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()+=');
      });
    });
  });
});
