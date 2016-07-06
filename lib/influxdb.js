'use strict';

var Influx = require('influx'),
    constants = {
        PLUGIN_NAME: 'influxdb'
    },
    messages = {},
    impl = {
        validateConfig: function (scriptConfig) {
            // console.log('Checking configuration:\n' + JSON.stringify(scriptConfig, null, 4));
            console.log('Checking configuration:...\n');
            // TODO: Determine config requirements and implement Unit Tests
        },
        createReporter: function (pluginConfig) {
            console.log('Creating Influx Reporter:\n' + JSON.stringify(pluginConfig.influx, null, 4));
            return new Influx(pluginConfig.influx);
        },
        reportResults: function (influxReporter, testReport) {
            var points = [],
                samples = 0,
                sample;

            while (samples < testReport.aggregate.latencies.length) {
                sample = testReport.aggregate.latencies[samples++];
                points.push([{
                    time: sample[0], // TODO: constants, not magic #'s
                    value: sample[2]
                }, {
                    response: sample[3]
                }]);
            }

            // TODO: Make name written to configurable
            influxReporter.writePoints('artillery_results', points, function (err) {
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

            impl.validateConfig(scriptConfig.plugins[constants.PLUGIN_NAME]);
            reporter = impl.createReporter(scriptConfig.plugins[constants.PLUGIN_NAME]);

            eventEmitter.on('done', function (report) {
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
