/**!
 *
 * Copyright (c) 2015-2016 Cisco Systems, Inc. See LICENSE file.
 * @private
 */

import '../..';

import {assert} from '@ciscospark/test-helper-chai';
import sinon from '@ciscospark/test-helper-sinon';
import CiscoSpark from '@ciscospark/spark-core';
import testUsers from '@ciscospark/test-helper-test-users';
import {patterns} from '@ciscospark/common';
import querystring from 'querystring';
import url from 'url';
import uuid from 'uuid';

describe(`plugin-user`, function() {
  this.timeout(30000);

  let spark, user1, user2, user3;

  before(() => testUsers.create({count: 3})
    .then((users) => {
      user1 = users[0];
      user2 = users[1];
      user3 = users[2];
      spark = new CiscoSpark({
        credentials: {
          supertoken: user1.token
        }
      });
      assert.isDefined(spark.credentials.supertoken);
      assert.isTrue(spark.canAuthorize);

      return spark.device.register();
    }));

  describe(`#verify()`, () => {
    const unauthSpark = new CiscoSpark();
    it(`registers a new user`, () => unauthSpark.user.verify({email: `Collabctg+spark-js-sdk-${uuid.v4()}@gmail.com`})
      .then((res) => {
        assert.property(res, `hasPassword`);
        assert.property(res, `verificationEmailTriggered`);
        assert.property(res, `sso`);
        assert.isFalse(res.hasPassword);
        assert.isTrue(res.verificationEmailTriggered);
        assert.isFalse(res.sso);
      })
    );

    it(`verifies an existing user`, () => unauthSpark.user.verify({email: user1.email})
      .then((res) => {
        assert.property(res, `hasPassword`);
        assert.property(res, `verificationEmailTriggered`);
        assert.property(res, `sso`);
        assert.isTrue(res.hasPassword);
        assert.isFalse(res.verificationEmailTriggered);
        assert.isFalse(res.sso);
      })
    );

    it(`leaves email address validation up to Atlas`, () => assert.isRejected(unauthSpark.user.verify({email: `not an email address`}))
      .then((res) => assert.statusCode(res, 400)));
  });

  describe(`#setPassword()`, () => {
    it(`sets the user's password`, () => spark.user.setPassword({userId: user1.id, password: `P@ssword123`})
      .then(() => spark.user.verify({email: user1.email}))
      .then((res) => {
        assert.property(res, `hasPassword`);
        assert.property(res, `verificationEmailTriggered`);
        assert.property(res, `sso`);
        assert.isTrue(res.hasPassword);
        assert.isFalse(res.verificationEmailTriggered);
        assert.isFalse(res.sso);
      })
    );
  });

  // NOTE: need collabctg+*@gmail.com to get verifyEmailURL
  describe(`#activate()`, () => {
    const unauthSpark = new CiscoSpark();
    it(`retrieves a valid user token`, () => {
      assert.isUndefined(unauthSpark.credentials.supertoken);
      const email = `collabctg+spark-js-sdk-${uuid.v4()}@gmail.com`;
      return unauthSpark.user.verify({email})
        .then((res) => {
          assert.isTrue(res.verificationEmailTriggered);
          assert.property(res, `verifyEmailURL`);
          const query = url.parse(res.verifyEmailURL).query;
          const token = querystring.parse(query).t;
          return assert.isFulfilled(unauthSpark.user.activate({verificationToken: token}));
        })
        .then((res) => {
          assert.property(res, `email`);
          assert.property(res, `tokenData`);
          assert.equal(res.email, email);
          assert.isDefined(unauthSpark.credentials.supertoken.access_token);
          return unauthSpark.user.verify({email});
        })
        .then((res) => {
          // verification email should not trigger if already have valid user token
          assert.property(res, `hasPassword`);
          assert.property(res, `verificationEmailTriggered`);
          assert.property(res, `sso`);
          assert.isFalse(res.hasPassword);
          assert.isFalse(res.verificationEmailTriggered);
          assert.isFalse(res.sso);
        });
    });

    it(`retrieves a valid user token and sets the password`, () => {
      const unauthSpark = new CiscoSpark();
      assert.isUndefined(unauthSpark.credentials.supertoken);
      const email = `collabctg+spark-js-sdk-${uuid.v4()}@gmail.com`;
      return unauthSpark.user.verify({email})
        .then((res) => {
          assert.isTrue(res.verificationEmailTriggered);
          assert.property(res, `verifyEmailURL`);
          const query = url.parse(res.verifyEmailURL).query;
          const token = querystring.parse(query).t;
          return assert.isFulfilled(unauthSpark.user.activate({verificationToken: token}));
        })
        .then((res) => {
          assert.property(res, `email`);
          assert.property(res, `tokenData`);
          assert.equal(res.email, email);
          assert.isDefined(unauthSpark.credentials.supertoken.access_token);
        })
        .then(() => unauthSpark.device.register())
        .then(() => unauthSpark.user.get())
        .then((user) => unauthSpark.user.setPassword({userId: user.id, password: `P@ssword123`}))
        .then(() => unauthSpark.user.verify({email}))
        .then((res) => {
          assert.property(res, `hasPassword`);
          assert.property(res, `verificationEmailTriggered`);
          assert.property(res, `sso`);
          assert.isTrue(res.hasPassword);
          assert.isFalse(res.verificationEmailTriggered);
          assert.isFalse(res.sso);
        });
    });
  });

  describe(`#get()`, () => {
    it(`gets the current user`, () => spark.user.get()
      .then((user) => {
        assert.equal(user.id, spark.device.userId);
        assert.property(user, `entitlements`);
        assert.property(user, `email`);
        assert.property(user, `name`);
      }));
  });

  describe(`#asUUID()`, () => {
    function makeEmailAddress() {
      return `spark-js-sdk--test-${uuid.v4()}@example.com`;
    }

    let email;
    beforeEach(() => {
      email = makeEmailAddress();
    });

    it(`maps an email address to a uuid`, () => assert.eventually.equal(spark.user.asUUID(user2, {force: true}), user2.id));

    it(`maps an email address for a non-existent user to a fake uuid`, () => assert.eventually.match(spark.user.asUUID(email), patterns.uuid)
        .then(() => spark.user.store.getByEmail(email))
        .then((u) => assert.isFalse(u.userExists, `User does not exist`)));

    describe(`with {create: true}`, () => {
      let spy;
      beforeEach(() => {
        spy = sinon.spy(spark.user, `fetchUUID`);
      });
      afterEach(() => spy.restore());

      it(`creates a new user`, () => assert.eventually.match(spark.user.asUUID(email, {create: true}), patterns.uuid)
        .then(() => spark.user.store.getByEmail(email))
        .then((u) => assert.isTrue(u.userExists, `User exists`)));

      it(`does not use a cached value if the previous value was marked as non-existent`, () => assert.eventually.match(spark.user.asUUID(email), patterns.uuid)
          .then(() => spark.user.store.getByEmail(email))
          .then((u) => assert.isFalse(u.userExists, `User does not exist`))
          .then(() => spark.user.asUUID(email, {create: true}), patterns.uuid)
          .then(() => spark.user.store.getByEmail(email))
          .then((u) => assert.isTrue(u.userExists, `User exists`))
          .then(() => assert.calledTwice(spy)));

      it(`does not use a cached value if the previous value's existence is unknown`, () => spark.user.recordUUID({
        id: user3.id,
        emailAddress: user3.email
      })
        .then(() => spark.user.store.getByEmail(user3.email))
        .then((user) => assert.isUndefined(user.userExists, `User's existence is unknown`))
        .then(() => assert.eventually.equal(spark.user.asUUID(user3.email, {create: true}), user3.id))
        .then(() => assert.called(spy))
        .then(() => spark.user.store.getByEmail(user3.email))
        .then((user) => assert.isTrue(user.userExists, `User exists`)));
    });
  });

  describe(`#update()`, () => {
    it(`updates a user's name`, () => spark.user.update({displayName: `New Display Name`})
      .then((user) => {
        assert.equal(user.id, spark.device.userId);
        assert.property(user, `entitlements`);
        assert.property(user, `email`);
        assert.property(user, `name`);
        assert.equal(user.name, `New Display Name`);
      }));
  });
});
