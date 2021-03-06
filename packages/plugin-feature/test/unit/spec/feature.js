/**!
 *
 * Copright(c) 2015 Cisco Systems, Inc. See LICENSE file.
 * @private
 */

import {assert} from '@ciscospark/test-helper-chai';
import Device from '@ciscospark/plugin-wdm';
import Feature from '../..';
import MockSpark from '@ciscospark/test-helper-mock-spark';
import sinon from '@ciscospark/test-helper-sinon';

describe(`plugin-feature`, () => {
  describe(`Feature`, () => {
    let spark;

    beforeEach(() => {
      spark = new MockSpark({
        children: {
          device: Device,
          feature: Feature
        }
      });
    });

    describe(`#getFeature()`, () => {
      it(`requires a valid keyType`, () => {
        return assert.isRejected(spark.feature.getFeature(`none`, `featureName`, {}),
          /Invalid feature keyType provided. Only \`developer\`, \`user\`, and \`entitlement\` feature toggles are permitted./);
      });

      it(`returns the full feature object`, () => {
        const key = `featureName`;
        const keyType = `developer`;
        const feature = {
          key,
          mutable: true,
          type: `boolean`,
          val: `true`,
          value: true
        };
        spark.device.features[keyType].add(feature);
        return assert.becomes(spark.feature.getFeature(keyType, key, {full: true}), feature);
      });

      it(`returns the feature value`, () => {
        const key = `featureName`;
        const keyType = `developer`;
        const feature = {
          key,
          mutable: true,
          type: `boolean`,
          val: `true`,
          value: true
        };
        spark.device.features[keyType].add(feature);
        return assert.becomes(spark.feature.getFeature(keyType, key), feature.value);
      });
    });

    describe(`#setFeature()`, () => {
      beforeEach(() => {
        spark.request = sinon.stub().returns(Promise.resolve({
          body: {},
          statusCode: 200
        }));
      });
      afterEach(() => {
        spark.request.reset();
      });
      it(`does not allow entitlement keyType to be set`, () => {
        return assert.isRejected(spark.feature.setFeature(`entitlement`, `featureName`, true),
          /Only `developer` and `user` feature toggles can be set./);
      });

      [
        `developer`,
        `user`
      ].forEach((keyType) => {
        it(`sets a value for a ${keyType} feature toggle`, () => {
          spark.device.features[keyType].add = sinon.stub();
          spark.feature.setFeature(keyType, `featureName`, true)
          .then(() => {
            assert.called(spark.device.features[keyType].add);
            assert.equal(spark.request.getCall(0).args[0].resource, `features/users/${spark.device.userId} /${keyType}`);
          });
        });
      });
    });

    describe(`when a feature is changed`, () => {
      [
        `developer`,
        `entitlement`,
        `user`
      ].forEach((keyType) => {
        it(`emits \`change:${keyType}\` on ${keyType} feature change`, () => {
          const mockEventHandler = sinon.spy();
          spark.feature.on(`change:${keyType}`, mockEventHandler);
          const key = `featureName`;
          const feature = {
            key,
            mutable: true,
            type: `boolean`,
            val: `true`,
            value: true
          };
          spark.device.features[keyType].add(feature);
          return assert.called(mockEventHandler);
        });
      });

    });

  });
});
