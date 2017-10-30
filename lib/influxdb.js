'use strict';

let Influx = require('influx'),
    jp = require('jsonpath'),
    uuid = require('uuid'),
    util = require('util'),
    AJV = require('ajv'),
    join = require('path').join,
    safeEval = require('safe-eval'),
    constants = {
        PLUGIN_NAME: 'influxdb',

        // TODO: Curry helpers?
        // indexes of artillery's results:
        TIMESTAMP: 0,
        REQUEST_ID: 1,
        LATENCY: 2,
        STATUS_CODE: 3,

        // required configuration names
        CONFIG_TEST_NAME: 'testName',
        CONFIG_MEASUREMENT_NAME: 'measurementName',
        CONFIG_ERROR_MEASUREMENT_NAME: 'errorMeasurementName',
        CONFIG_TEST_RUN_ID: 'testRunId',
        CONFIG_EXCLUDE_TEST_RUN_ID: 'excludeTestRunId',
        CONFIG_INFLUX: 'influx',
        CONFIG_INFLUX_HOST: 'host',
        CONFIG_INFLUX_USERNAME: 'username',
        CONFIG_INFLUX_PASSWORD: 'password',
        CONFIG_INFLUX_DATABASE: 'database',
        CONFIG_STATIC_TAGS: 'tags',
        CONFIG_MATCHES: 'matches',

        MATCHES_FIELD_NAME: 'matches',
        MATCHES_FIELD_QUERY: '$.testReport._matches',

        // TODO: Now not needed?
        // Defaults
        DEFAULT_MEASUREMENT_NAME: 'latency',
        DEFAULT_ERROR_MEASUREMENT_NAME: 'clientErrors',

        // TODO: More general solution to override ANY value with ENV?
        // environment variables
        ENV_INFLUX_USERNAME: 'INFLUX_USERNAME',
        ENV_INFLUX_PASSWORD: 'INFLUX_PASSWORD'
    },
    messages = {
        pluginsConfigNotFound: 'No "plugins" configuration found.',
        pluginConfigIsRequired: 'The configuration for %s is required.',
        pluginParamIsRequired: 'The configuration parameter %s is required.',
        pluginParamOrEnvIsRequired: 'The configuration parameter %s or environment variable %s is required.',
        influxdbHostMustBeHostname: 'The %s property must be a host name only, protocol and port cannot be used.',
        metricsReportedToInflux: '%s metrics reported to InfluxDB.'
    },
    debug = (...args) => {
        if (process.env.DEBUG) {
            console.error(...args);
        }
    },
    impl = {
        defaultMeasurements: {
            latency: {
                granularity: 'sample',
                fields: {
                    queries: {
                        value: '$.sample[${constants.LATENCY}]',
                        time: '$.sample[${constants.TIMESTAMP}]'
                    },
                    mappers: {
                        value: 'v => v / 1000000'
                    }
                },
                tags: {
                    queries: {
                        response: '$.sample[${constants.STATUS_CODE}]'
                    }
                }
            },
            clientErrors: {
                granularity: 'report',
                fields: {
                    queries: {
                        value: '$.testReport.errors.*'
                    },
                    reducers: {
                        value: '(acc, value) => acc + value'
                    },
                    defaults: {
                        time: '() => Date.now()'
                    }
                }
            }
        },
        handleError: (message) => {
            console.error(message);
            throw new Error(message);
        },
        determineInfluxLoginCredentials: (pluginConfig) => {
            function setFromConfigOrEnv(configName, envName) {
                // Check to see if value is provided in config
                if (!pluginConfig[constants.CONFIG_INFLUX][configName]) {
                    // If not, try to read it from the environment.
                    if (process.env[envName]) {
                        pluginConfig[constants.CONFIG_INFLUX][configName] = process.env[envName];
                    } else {
                        // Cannot proceed without this value
                        impl.handleError(util.format(messages.pluginParamOrEnvIsRequired, constants.CONFIG_INFLUX + '.' + configName, envName));
                    }
                }
            }

            setFromConfigOrEnv(constants.CONFIG_INFLUX_USERNAME, constants.ENV_INFLUX_USERNAME);
            setFromConfigOrEnv(constants.CONFIG_INFLUX_PASSWORD, constants.ENV_INFLUX_PASSWORD);
        },
        validateConfig:
            defaultMeasurements =>
                scriptConfig => {
                const ajv = new AJV(),
                    requiredInfluxConfigs = [
                        constants.CONFIG_INFLUX_HOST,
                        constants.CONFIG_INFLUX_USERNAME,
                        constants.CONFIG_INFLUX_PASSWORD,
                        constants.CONFIG_INFLUX_DATABASE
                    ];

                if (!scriptConfig) {
                    impl.handleError(util.format(messages.pluginConfigIsRequired, constants.PLUGIN_NAME));
                }

                ajv.addSchema(require(join(__dirname, 'config-schema.json')), 'config');
                if (!ajv.validate('config', scriptConfig)) {
                    impl.handleError(`Invalid configuration: ${ajv.errorsText()}`);
                }

                impl.determineInfluxLoginCredentials(scriptConfig);

                requiredInfluxConfigs.forEach(function (configName) {
                    if (!scriptConfig[constants.CONFIG_INFLUX][configName]) {
                        impl.handleError(
                            util.format(messages.pluginParamIsRequired, constants.CONFIG_INFLUX + '.' + configName)
                        );
                    }

                    // Check that host is name only: no protocol or port.
                    if (configName === constants.CONFIG_INFLUX_HOST) {
                        let host = scriptConfig[constants.CONFIG_INFLUX][configName];
                        if (host.indexOf(':') > -1 || host.indexOf('/') > -1) {
                            impl.handleError(
                                util.format(messages.influxdbHostMustBeHostname, constants.CONFIG_INFLUX + '.' + configName)
                            );
                        }
                    }
                });

                if (scriptConfig[constants.CONFIG_MATCHES]) {
                    defaultMeasurements[constants.DEFAULT_MEASUREMENT_NAME]
                        .fields.queries[constants.CONFIG_MATCHES] = '$.testReport._matches';
                }

                if (!scriptConfig[constants.CONFIG_STATIC_TAGS]) {
                    scriptConfig[constants.CONFIG_STATIC_TAGS] = {};
                }

                if (!scriptConfig[constants.CONFIG_TEST_NAME]) {
                    impl.handleError(util.format(messages.pluginParamIsRequired, constants.CONFIG_TEST_NAME));
                }

                scriptConfig[constants.CONFIG_STATIC_TAGS][constants.CONFIG_TEST_NAME] = scriptConfig[constants.CONFIG_TEST_NAME];

                if (scriptConfig[constants.CONFIG_MEASUREMENT_NAME]) {
                    defaultMeasurements[scriptConfig[constants.CONFIG_MEASUREMENT_NAME]] =
                        Object.assign({}, defaultMeasurements[constants.DEFAULT_MEASUREMENT_NAME]);
                    delete defaultMeasurements[constants.DEFAULT_MEASUREMENT_NAME];
                }

                if (scriptConfig[constants.CONFIG_ERROR_MEASUREMENT_NAME]) {
                    defaultMeasurements[scriptConfig[constants.CONFIG_ERROR_MEASUREMENT_NAME]] =
                        Object.assign({}, defaultMeasurements[constants.DEFAULT_ERROR_MEASUREMENT_NAME]);
                    delete defaultMeasurements[constants.DEFAULT_ERROR_MEASUREMENT_NAME];
                }

                // If no testRunId is provided in the static tags, and excludeTestRunId is not set then generate one.
                if (!scriptConfig[constants.CONFIG_STATIC_TAGS][constants.CONFIG_TEST_RUN_ID] &&
                    !scriptConfig[constants.CONFIG_EXCLUDE_TEST_RUN_ID]) {
                    scriptConfig[constants.CONFIG_STATIC_TAGS][constants.CONFIG_TEST_RUN_ID] = uuid.v4();
                }

                scriptConfig.measurements = scriptConfig.measurements || defaultMeasurements;

                return scriptConfig;
            },
        createReporter: (config) => {
            return new Influx(config.influx);
        },
        writeMeasurements: (config, influxReporter, testReport) => {
            const measures = config.measurements;

            // Work around change in testReport schema in artillery-core (Issue #3)
            if (testReport._entries) {
                testReport.latencies = testReport._entries;
            }

            // Work around change in testReport schema in artillery-core (Issue #3)
            if (testReport._errors) {
                testReport.errors = testReport._errors;
            }

            if (measures) {
                Object.keys(measures).forEach(
                    measure => impl.writeMeasurement(measure, measures[measure], config, influxReporter, testReport)
                );
            }
        },
        eachProp:
            obj =>
                action => {
                    if (obj) {
                        Object.keys(obj).forEach(prop => {
                            action(obj, prop);
                        });
                    }
                },
        applyQueriedValue:
            source =>
                target =>
                    (obj, prop) => {
                        debug('query:', prop, obj[prop]);
                        target[prop] = obj[prop] ? jp.query(source, safeEval('`' + obj[prop] + '`', { constants })) : null;
                        debug('result:', target[prop]);
                    },
        applyDefaults:
            target =>
                (obj, prop) => {
                    if (!target[prop] || (target[prop] instanceof Array && target[prop].length === 0)) {
                        const evaluatedDefault = safeEval(obj[prop]);
                        debug('default:', prop, typeof evaluatedDefault, obj[prop]);
                        target[prop] = typeof evaluatedDefault === 'function' ? [evaluatedDefault()] : [evaluatedDefault];
                        debug('result:', target[prop]);
                    }
                },
        applyMaps:
            target =>
                (obj, prop) => {
                    debug('map:', prop, obj[prop], '->', target[prop]);
                    target[prop] = target[prop].map(safeEval(obj[prop]));
                    debug('result:', target[prop]);
                },
        applyReducers:
            target =>
                (obj, prop) => {
                    if (target[prop] instanceof Array && target[prop].length > 0) {
                        debug('reducer:', prop, obj[prop]);
                        target[prop] = target[prop].reduce(safeEval(obj[prop]));
                        debug('result:', target[prop]);
                    }
                },
        extractResult:
            target =>
                (obj, prop) => {
                    if (target[prop] instanceof Array && target[prop].length > 0) {
                        debug('extract:', prop, obj[prop]);
                        target[prop] = target[prop][0];
                        debug('result:', target[prop]);
                    }
                },
        measurementProcessor:
            origin =>
                measurement => {
                    let result = {};

                    impl.eachProp(measurement.queries)(impl.applyQueriedValue(origin)(result));
                    debug('0 - Queries', result);

                    impl.eachProp(measurement.defaults)(impl.applyDefaults(result));
                    debug('1 - Defaults', result);

                    impl.eachProp(measurement.mappers)(impl.applyMaps(result));
                    debug('2 - Maps', result);

                    impl.eachProp(measurement.reducers)(impl.applyReducers(result));
                    debug('3 - Reducers', result);

                    impl.eachProp(result)(impl.extractResult(result));
                    debug('4 - Extract', result);

                    return result;
                },
        addMeasurementPoints:
            config =>
                points =>
                    (measurement, measurementName) =>
                        origin => {
                            const fields = measurement.fields ? impl.measurementProcessor(origin)(measurement.fields) : {};
                            debug(measurementName, 'fields', fields);

                            if (fields.value instanceof Array && fields.value.length === 0) {
                                return;
                            }

                            const tags = measurement.tags ? impl.measurementProcessor(origin)(measurement.tags) : {};
                            debug(measurementName, 'tags', tags);

                            points.push([fields, Object.assign({}, tags, config[constants.CONFIG_STATIC_TAGS])]);
                        },

        writeMeasurement: (measurementName, measurement, config, influxReporter, testReport) => {
            let points = [];
            const pointAdder = impl.addMeasurementPoints(config)(points)(measurement, measurementName);

            debug('testReport:', testReport);

            debug('granularity', measurement.granularity, measurementName);
            if (measurement.granularity === 'sample') {
                testReport.latencies.forEach(sample => pointAdder({ sample, testReport }));
            } else {
                pointAdder({ testReport });
            }

            debug(points);
            if (points.length === 0) {
                debug(`No data for measurement ${measurementName}: nothing sent to InfluxDB`);
                return;
            }

            influxReporter.writePoints(measurementName, points, function (err) {
                if (err) {
                    impl.handleError(err.message);
                } else {
                    debug(util.format(messages.metricsReportedToInflux, points.length));
                }
            });
        }
    },
    api = {
        init: function (scriptConfig, eventEmitter) {
            if (!scriptConfig || !scriptConfig.plugins) {
                impl.handleError(constants.pluginsConfigNotFound);
            }

            const config = impl.validateConfig
                                (impl.defaultMeasurements)
                                    (scriptConfig.plugins[constants.PLUGIN_NAME]),
                reporter = impl.createReporter(config);

            eventEmitter.on('stats', function (report) {
                impl.writeMeasurements(config, reporter, report);
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
