'use strict';

var Influx = require('influx'),
    constants = {
        PLUGIN_NAME: 'influxdb',

        // indexes of artillery's results:
        TIMESTAMP: 0,
        REQUEST_ID: 1,
        LATENCY: 2,
        STATUS_CODE: 3,

        // configuration names
        CONFIG_TEST_NAME: 'test_name',
        CONFIG_INFLUX: 'influx',
        CONFIG_INFLUX_HOST: 'host',
        CONFIG_INFLUX_USERNAME: 'username',
        CONFIG_INFLUX_PASSWORD: 'password',
        CONFIG_INFLUX_DATABASE: 'database',

        // message parts
        MSG_PLUGIN: '{{plugin-name}}',
        MSG_PARAM: '{{param-name}}'
    },
    messages = {
        pluginsConfigNotFound: 'No "plugins" configuration found.',
        pluginConfigIsRequired: 'The configuration for {{plugin-name}} is required.',
        pluginParamIsRequired: 'The configuration parameter {{param-name}} is required.'
    },
    impl = {
        validateConfig: function (scriptConfig) {
            var influxConfigs = [
                constants.CONFIG_INFLUX_HOST,
                constants.CONFIG_INFLUX_USERNAME,
                constants.CONFIG_INFLUX_PASSWORD,
                constants.CONFIG_INFLUX_DATABASE
            ];

            // There must be a configuration object.
            if (!scriptConfig) {
                throw new Error(messages.pluginConfigIsRequired.replace(constants.MSG_PLUGIN, constants.PLUGIN_NAME));
            }

            // It must provide a test name.
            if (!scriptConfig[constants.CONFIG_TEST_NAME]) {
                throw new Error(messages.pluginParamIsRequired.replace(constants.MSG_PARAM, constants.CONFIG_TEST_NAME));
            }

            // Check each of the influx-specific settings and validate.
            influxConfigs.forEach(function(configName) {
                if (!scriptConfig[constants.CONFIG_INFLUX][configName]) {
                    throw new Error(messages.pluginParamIsRequired.replace(constants.MSG_PARAM, constants.CONFIG_INFLUX + '.' + configName));
                }
            });

            // Using the current timestamp, create a run id.
            // TODO: This should be provided to us.
            scriptConfig.testRunId = Date.now();

            // Cache config settings.
            impl.config = scriptConfig;
        },
        createReporter: function () {
            return new Influx(impl.config.influx);
        },
        reportResults: function (influxReporter, testReport) {
            var points = [],
                samples = 0,
                sample;

            // For each of the latencies, create a point for influx.
            while (samples < testReport.aggregate.latencies.length) {
                sample = testReport.aggregate.latencies[samples++];

                points.push([{
                    time: sample[constants.TIMESTAMP],
                    value: sample[constants.LATENCY] / 1000000
                }, {
                    response: sample[constants.STATUS_CODE],
                    testRunId: impl.config.testRunId
                }]);
            }

            // Call influx server to write the sample set.
            influxReporter.writePoints(impl.config[constants.CONFIG_TEST_NAME], points, function (err) {
                if (err) {
                    throw new Error(err.message);
                }
                console.log(points.length + ' metrics reported to Influx');
            });
        }
    },
    api = {
        init: function (scriptConfig, eventEmitter) {
            var reporter;

            // Check for presence of any plugin configuration.
            if (!scriptConfig || !scriptConfig.plugins) {
                throw new Error(constants.pluginsConfigNotFound);
            }

            // Validate the settings provided for our specific plugin.
            impl.validateConfig(scriptConfig.plugins[constants.PLUGIN_NAME]);

            // Create a reporting client and attach to DONE event from Artillery.
            reporter = impl.createReporter();
            eventEmitter.on('done', function (report) {
                // Finally done! Report results to influx.
                impl.reportResults(reporter, report);
            });
        }
    };

module.exports = api.init;

/* test-code */
module.exports.constants = constants;
module.exports.messages = messages;
module.exports.impl = impl;
module.exports.api = api;
/* end-test-code */
