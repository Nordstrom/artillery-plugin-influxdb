'use strict';

var Influx = require('influx'),
    constants = {
        PLUGIN_NAME: 'influxdb',

        // indexes of artillery's results:
        TIMESTAMP: 0,
        REQUEST_ID: 1,
        LATENCY: 2,
        STATUS_CODE: 3,

        // required configuration names
        CONFIG_TEST_NAME: 'test_name',
        CONFIG_INFLUX: 'influx',
        CONFIG_INFLUX_HOST: 'host',
        CONFIG_INFLUX_USERNAME: 'username',
        CONFIG_INFLUX_PASSWORD: 'password',
        CONFIG_INFLUX_DATABASE: 'database',

        // environment variables
        ENV_INFLUX_USERNAME: 'INFLUX_USERNAME',
        ENV_INFLUX_PASSWORD: 'INFLUX_PASSWORD',

        // message parts
        MSG_PLUGIN: '{{plugin-name}}',
        MSG_PARAM: '{{param-name}}',
        MSG_COUNT: '{{count}}',
        MSG_ENV_VAR: '{{env-var}}'
    },
    messages = {
        pluginsConfigNotFound: 'No "plugins" configuration found.',
        pluginConfigIsRequired: 'The configuration for {{plugin-name}} is required.',
        pluginParamIsRequired: 'The configuration parameter {{param-name}} is required.',
        pluginParamOrEnvIsRequired: 'The configuration parameter {{param-name}} or environment variable {{env-var}} is required.',
        multipleInfluxClientsNotSupported: 'Multiple Influx DB clients are not supported.',
        metricsReportedToInflux: '{{count}} metrics reported to InfluxDB.'
    },
    impl = {
        determineInfluxLoginCredentials: function(pluginConfig) {
            function composeErrorMessage(param, env) {
                return messages.pluginParamOrEnvIsRequired
                    .replace(constants.MSG_PARAM, [constants.CONFIG_INFLUX] + '.' + param)
                    .replace(constants.MSG_ENV_VAR, [constants.CONFIG_INFLUX] + '.' + env);
            }

            function setFromConfigOrEnv(configName, envName) {
                // Check to see if value is provided in config
                if (!pluginConfig[constants.CONFIG_INFLUX][configName]) {
                    // If not, try to read it from the environment.
                    if (process.env[envName]) {
                        pluginConfig[constants.CONFIG_INFLUX][configName] = process.env[envName];
                    } else {
                        // Cannot proceed without this value
                        throw new Error(composeErrorMessage(configName, envName));
                    }
                }
            }

            setFromConfigOrEnv(constants.CONFIG_INFLUX_USERNAME, constants.ENV_INFLUX_USERNAME);
            setFromConfigOrEnv(constants.CONFIG_INFLUX_PASSWORD, constants.ENV_INFLUX_PASSWORD);
        },
        validateConfig: function (scriptConfig) {
            // Guard against invalid usage: multiple instances not allowed.
            if (impl.config) {
                throw new Error(messages.multipleInfluxClientsNotSupported);
            }

            // These are the minimum required config values
            var requiredInfluxConfigs = [
                constants.CONFIG_INFLUX_HOST,
                constants.CONFIG_INFLUX_USERNAME,
                constants.CONFIG_INFLUX_PASSWORD,
                constants.CONFIG_INFLUX_DATABASE
            ];

            // There must be a configuration object.
            if (!scriptConfig) {
                throw new Error(messages.pluginConfigIsRequired.replace(constants.MSG_PLUGIN, constants.PLUGIN_NAME));
            }

            impl.determineInfluxLoginCredentials(scriptConfig);

            // It must provide a test name.
            if (!scriptConfig[constants.CONFIG_TEST_NAME]) {
                throw new Error(messages.pluginParamIsRequired.replace(constants.MSG_PARAM, constants.CONFIG_TEST_NAME));
            }

            // Check each of the influx-specific settings and validate.
            requiredInfluxConfigs.forEach(function(configName) {
                if (!scriptConfig[constants.CONFIG_INFLUX][configName]) {
                    throw new Error(messages.pluginParamIsRequired.replace(constants.MSG_PARAM, constants.CONFIG_INFLUX + '.' + configName));
                }
            });

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
                }, Object.assign({
                    response: sample[constants.STATUS_CODE]
                }, impl.config.tags)]);
            }

            // Call influx server to write the sample set.
            influxReporter.writePoints(impl.config[constants.CONFIG_TEST_NAME], points, function (err) {
                if (err) {
                    throw new Error(err.message);
                }
                console.log(messages.metricsReportedToInflux.replace(constants.MSG_COUNT, points.length));
            });
        }
    },
    api = {
        init: function (scriptConfig, eventEmitter) {
            var reporter;

            // Check for presence of any Plugin configuration.
            if (!scriptConfig || !scriptConfig.plugins) {
                throw new Error(constants.pluginsConfigNotFound);
            }

            // Validate the settings provided for our specific Plugin.
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
