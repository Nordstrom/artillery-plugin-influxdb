'use strict';

var expect = require('chai').expect,
    path = require('path'),
    mute = require('mute'),
    unmute;

describe('Artillery Influx DB plug-in must correctly validate configurations', function() {
    let config;
    const Plugin = require(path.join(__dirname, '../lib/influxdb.js'));
    const configNoDefaultMeasurements = Plugin.impl.validateConfig({});
    const configWithDefaultMeasures = Plugin.impl.validateConfig(Plugin.impl.defaultMeasurements);
    const testArtilleryReport = {
        _matches: 88,
        latencies: [
            [null, null, 999, null]
        ]
    };

    before(function() {
        unmute = mute(process.stderr);
    });

    // after setting up the mock for 'influx' load the module under test.
    afterEach(function() {
        // Delete the cached configuration after each test
        delete Plugin.impl.config;

        // Delete environment variables created
        delete process.env[Plugin.constants.ENV_INFLUX_PASSWORD];
        delete process.env[Plugin.constants.ENV_INFLUX_USERNAME];
    });

    after(function() {
        unmute();
    });

    it('accepts a valid configuration', function() {
        expect(function() {
            configNoDefaultMeasurements({
                    testName: 'this is a valid test name',
                    influx: {
                        host: 'my-test-host-name',
                        username: 'a-user',
                        password: 'p@ssw0rd',
                        database: 'any-db-name'
                    }
                }
            );
        }).not.to.throw();
    });

    it('requires testName in the configuration', function() {
        expect(function() {
            configNoDefaultMeasurements({
                    influx: {
                        host: 'my-test-host-name',
                        username: 'a-user',
                        password: 'p@ssw0rd',
                        database: 'any-db-name'
                    }
                }
            );
        }).to.throw(Error, /testName/);
    });

    it('requires influx.host in the configuration', function() {
        expect(function() {
            configNoDefaultMeasurements({
                    testName: 'this is a valid test name',
                    influx: {
                        username: 'a-user',
                        password: 'p@ssw0rd',
                        database: 'any-db-name'
                    }
                });
        }).to.throw(Error, /host/);
    });

    it('requires influx.host to be a host and not include protocol or port', function() {
        expect(function() {
            configNoDefaultMeasurements({
                    testName: 'this is a valid test name',
                    influx: {
                        host: 'http://my-test-host-name',
                        username: 'a-user',
                        password: 'p@ssw0rd',
                        database: 'any-db-name'
                    }
                });
        }).to.throw(Error, /influx.host/);

        expect(function() {
            configNoDefaultMeasurements({
                    testName: 'this is a valid test name',
                    influx: {
                        host: 'http://my-test-host-name:8080',
                        username: 'a-user',
                        password: 'p@ssw0rd',
                        database: 'any-db-name'
                    }
                });
        }).to.throw(Error, /influx.host/);

        expect(function() {
            configNoDefaultMeasurements({
                    testName: 'this is a valid test name',
                    influx: {
                        host: 'my-test-host-name:8080',
                        username: 'a-user',
                        password: 'p@ssw0rd',
                        database: 'any-db-name'
                    }
                });
        }).to.throw(Error, /influx.host/);
    });

    it('accepts username from the environment', function() {
        process.env[Plugin.constants.ENV_INFLUX_USERNAME] = 'a-user';

        expect(function() {
            configNoDefaultMeasurements({
                    testName: 'this is a valid test name',
                    influx: {
                        host: 'my-test-host-name',
                        password: 'p@ssw0rd',
                        database: 'any-db-name'
                    }
                });
        }).not.to.throw();
    });

    it('requires influx.username in the configuration or environment', function() {
        expect(function() {
            configNoDefaultMeasurements({
                    testName: 'this is a valid test name',
                    influx: {
                        host: 'my-test-host-name',
                        password: 'p@ssw0rd',
                        database: 'any-db-name'
                    }
                });
        }).to.throw(Error, /influx.username/);
    });

    it('accepts password from the environment', function() {
        process.env[Plugin.constants.ENV_INFLUX_PASSWORD] = 'p@ssw0rd';

        expect(function() {
            configNoDefaultMeasurements({
                    testName: 'this is a valid test name',
                    influx: {
                        host: 'my-test-host-name',
                        username: 'a-user',
                        database: 'any-db-name'
                    }
                });
        }).not.to.throw();
    });

    it('requires influx.password in the configuration or environment', function() {
        expect(function() {
            configNoDefaultMeasurements({
                    testName: 'this is a valid test name',
                    influx: {
                        host: 'my-test-host-name',
                        username: 'a-user',
                        database: 'any-db-name'
                    }
                });
        }).to.throw(Error, /influx.password/);
    });

    it('requires influx.database in the configuration', function() {
        expect(function() {
            configNoDefaultMeasurements({
                testName: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd'
                }
            });
        }).to.throw(Error, /database/);
    });

    it('will generate a testRunId if one is not provided', function() {
        expect(function() {
            config = configNoDefaultMeasurements({
                testName: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).not.to.throw();

        /*jshint -W030 */
        expect(config.tags.testRunId).not.to.be.undefined;
        expect(config.tags.testRunId).not.to.be.null;
        /*jshint +W030 */
        expect(config.tags.testRunId).to.be.a('string');
        expect(config.tags.testRunId.length).to.equal(36);
    });

    it('will generate a testRunId if one is not provided, unless excludeTestRunId is set', function() {
        expect(function() {
            config = configNoDefaultMeasurements({
                testName: 'this is a valid test name',
                excludeTestRunId: true,
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).not.to.throw();

        /*jshint -W030 */
        expect(config.tags.testRunId).to.be.undefined;
        /*jshint +W030 */
    });

    it('accepts the optional "matches" property', function() {
        expect(function() {
            config = configWithDefaultMeasures({
                testName: 'this is a valid test name',
                excludeTestRunId: true,
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                },
                matches: true
            });
        }).not.to.throw();

        /*jshint -W030 */
        expect(config.measurements.latency.fields.queries.matches).to.equal('$.testReport._matches');
        /*jshint +W030 */
    });

    describe('supports a configurable measurementName', function() {
        const config = {
            testName: 'this is a valid test name',
            excludeTestRunId: true,
            measurementName: 'testLatencies',
            influx: {
                host: 'my-test-host-name',
                username: 'a-user',
                password: 'p@ssw0rd',
                database: 'any-db-name'
            }
        };

        it('validates the config', function() {
            expect(function() {
                configWithDefaultMeasures(config);
            }).not.to.throw();
        });

        it('reports the measure to influx', function() {
            Plugin.impl.writeMeasurements(
                config,
                {
                    writePoints: (measurementName, points) => {
                        expect(measurementName).to.equal('testLatencies');
                        expect(points[0][0].value).to.equal(0.000999);
                        expect(points.length).to.equal(1);
                    }
                },
                testArtilleryReport
            );
        });
    });
});
