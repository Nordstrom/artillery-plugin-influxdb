'use strict';

let expect = require('chai').expect,
    path = require('path'),
    mute = require('mute'),
    Plugin = require(path.join(__dirname, '../lib/influxdb.js')),
    unmute;

describe('custom measurements', function() {
    const pluginValidateConfigWithDefaultMeasures =
            Plugin.impl.validateConfig(Plugin.impl.defaultMeasurements),
        composeTestMeasurementConfig =
            measurementsConfig => Object.assign(
                {
                    testName: 'custom-measurements',
                    influx: {
                        host: 'my-test-host-name',
                        username: 'a-user',
                        password: 'p@ssw0rd',
                        database: 'any-db-name'
                    }
                },
                measurementsConfig
            ),
        testArtilleryReport = {
            _matches: 88,
            latencies: [
                [null, null, 999, null],
                [null, null, 998, null],
                [null, null, 997, null]
            ]
        },
        measurementProcessingTest =
            testDescription =>
                measurementsConfig =>
                    (expected) => {
                        describe(testDescription, function () {
                            it('validates the configuration', function () {
                                const config = composeTestMeasurementConfig({
                                    measurements: measurementsConfig
                                });

                                expect(function () {
                                    pluginValidateConfigWithDefaultMeasures(config);
                                }).not.to.throw();

                                let called = 'influx not called';
                                Plugin.impl.writeMeasurements(
                                    config,
                                    {
                                        writePoints: (measurement, points) => {
                                            console.error('===>\n', measurement, points, expected);
                                            expected(measurement, points);
                                            called = 'influx called';
                                        }
                                    },
                                    testArtilleryReport
                                );
                                expect(called).to.equal('influx called');
                            });
                        });
                    },
        validConfigTest =
            testDescription =>
                config => {
                    it(testDescription, function() {
                        expect(function() {
                            pluginValidateConfigWithDefaultMeasures(
                                composeTestMeasurementConfig(config)
                            );
                        }).not.to.throw();
                    });
                },
        invalidConfigTest =
            testDescription =>
                config =>
                    (errorMessage) => {
                        it(testDescription, function() {
                            expect(function() {
                                pluginValidateConfigWithDefaultMeasures(
                                    composeTestMeasurementConfig(config)
                                );
                            }).to.throw(errorMessage);
                        });
                    };

    before(function() {
        unmute = mute(process.stderr);
    });

    after(function() {
        unmute();
    });

    describe('enforces configuration requirements', function() {
        invalidConfigTest
        ('rejects empty measurements config')
        ({
            measurements: {}
        })
        (/measurements should NOT have less than 1 properties/);

        invalidConfigTest
        ('rejects an empty measurement description')
        ({
            measurements: {
                myMeasurement: {}
            }
        })
        (/should have required property 'granularity'/);

        invalidConfigTest
        ('rejects an unrecognized granularity value')
        ({
            measurements: {
                myMeasurement: {
                    granularity: '???',
                    fields: {
                        queries: {
                            value: '$.sample'
                        }
                    }
                }
            }
        })
        (/granularity should be equal to one of the allowed values/);

        invalidConfigTest
        ('requires a measurement to define queries against the report')
        ({
            measurements: {
                myMeasurement: {
                    granularity: 'report',
                    fields: {}
                }
            }
        })
        (/fields should have required property 'queries'/);

        invalidConfigTest
        ('requires a measurement to provide a query for "value"')
        ({
            measurements: {
                myMeasurement: {
                    granularity: 'report',
                    fields: {
                        queries: {}
                    }
                }
            }
        })
        (/queries should have required property 'value'/);

        invalidConfigTest
        ('requires value queries to target (sample|testReport)')
        ({
            measurements: {
                myMeasurement: {
                    granularity: 'report',
                    fields: {
                        queries: {
                            value: '$.other'
                        }
                    }
                }
            }
        })
        (/\(sample\|testReport\)/);

        invalidConfigTest
        ('rejects tags definitions with no queries')
        ({
            measurements: {
                myMeasurement: {
                    granularity: 'report',
                    fields: {
                        queries: {
                            value: '$.sample'
                        }
                    },
                    tags: {}
                }
            }
        })
        (/tags should NOT have less than 1 properties/);

        invalidConfigTest
        ('requires tags query to define a member')
        ({
            measurements: {
                myMeasurement: {
                    granularity: 'report',
                    fields: {
                        queries: {
                            value: '$.sample'
                        }
                    },
                    tags: {
                        queries: {}
                    }
                }
            }
        })
        (/queries should NOT have less than 1 properties/);

        invalidConfigTest
        ('requires tags defaults to define a member')
        ({
            measurements: {
                myMeasurement: {
                    granularity: 'report',
                    fields: {
                        queries: {
                            value: '$.sample'
                        }
                    },
                    tags: {
                        defaults: {}
                    }
                }
            }
        })
        (/defaults should NOT have less than 1 properties/);

        describe('requires tags to define either queries or defaults', function() {
            validConfigTest
            ('queries alone')
            ({
                measurements: {
                    myMeasurement: {
                        granularity: 'report',
                        fields: {
                            queries: {
                                value: '$.sample'
                            }
                        },
                        tags: {
                            queries: {
                                myTag: '$.sample'
                            }
                        }
                    }
                }
            });

            validConfigTest
            ('defaults alone')
            ({
                measurements: {
                    myMeasurement: {
                        granularity: 'report',
                        fields: {
                            queries: {
                                value: '$.sample'
                            }
                        },
                        tags: {
                            defaults: {
                                myTag: 0
                            }
                        }
                    }
                }
            });

            invalidConfigTest
            ('rejects if both missing')
            ({
                measurements: {
                    myMeasurement: {
                        granularity: 'report',
                        fields: {
                            queries: {
                                value: '$.sample'
                            }
                        },
                        tags: {
                            mappers: {
                                myTag: ''
                            }
                        }
                    }
                }
            })
            (/.*(queries).*(defaults).*/);
        });
    });

    describe('queries', function() {
        measurementProcessingTest
        ('custom measurement for every artillery request/response (granularity:sample)')
        ({
            myMeasurement: {
                granularity: 'sample',
                fields: {
                    queries: { value: '$.sample[${constants.LATENCY}]' }
                }
            }
        })
        ((measurement, points) => {
            expect(measurement).to.equal('myMeasurement');
            expect(points[0][0]).to.deep.equal({ value: 999 });
            expect(points[1][0]).to.deep.equal({ value: 998 });
            expect(points[2][0]).to.deep.equal({ value: 997 });
            expect(points.length).to.equal(3);
        });

        measurementProcessingTest
        ('custom measurement for each artillery stats event (granularity:testReport)')
        ({
            myMeasurement: {
                granularity: 'report',
                fields: {
                    queries: { value: '$.testReport._matches' }
                }
            }
        })
        ((measurement, points) => {
            expect(measurement).to.equal('myMeasurement');
            expect(points[0][0]).to.deep.equal({ value: 88 });
            expect(points.length).to.equal(1);
        });

        measurementProcessingTest
        ('multiple measurements of differing granularity are supported')
        ({
            myMatches: {
                granularity: 'report',
                fields: {
                    queries: { value: '$.testReport._matches' }
                }
            },
            myCustomMeasure: {
                granularity: 'sample',
                fields: {
                    queries: { value: '$.sample[${constants.LATENCY}]' }
                }
            }
        })
        ((measurement, points) => {
            switch (measurement) {
                case 'myMatches':
                    expect(points[0][0]).to.deep.equal({ value: 88 });
                    expect(points.length).to.equal(1);
                    break;

                case 'myCustomMeasure':
                    expect(points[0][0]).to.deep.equal({ value: 999 });
                    expect(points[1][0]).to.deep.equal({ value: 998 });
                    expect(points[2][0]).to.deep.equal({ value: 997 });
                    expect(points.length).to.equal(3);
                    break;

                default:
                    throw new Error(`Unexpected measurement "${measurement}" was encountered.`);
            }
        });
    });

    describe('defaults', function() {
        const testLiteralValues =
            (valueDescriptor, defaultValue, expectedValue) =>
                describe(`uses ${valueDescriptor} as literal values`, function () {
                    measurementProcessingTest
                    ('for fields')
                    ({
                        myMeasurement: {
                            granularity: 'report',
                            fields: {
                                queries: {
                                    value: '$.sample.missing'
                                },
                                defaults: {
                                    value: defaultValue
                                }
                            }
                        }
                    })
                    ((measurement, points) => {
                        expect(measurement).to.equal('myMeasurement');
                        expect(points[0][0]).to.deep.equal({ value: expectedValue });
                        expect(points.length).to.equal(1);
                    });

                    measurementProcessingTest
                    ('for tags')
                    ({
                        myMeasurement: {
                            granularity: 'report',
                            fields: {
                                queries: {
                                    value: '$.testReport.latencies[*][${constants.LATENCY}]'
                                }
                            },
                            tags: {
                                defaults: {
                                    myTag: defaultValue
                                }
                            }
                        }
                    })
                    ((measurement, points) => {
                        expect(measurement).to.equal('myMeasurement');
                        expect(points[0][1].myTag).to.equal(expectedValue);
                        expect(points.length).to.equal(1);
                    });
                });

        testLiteralValues('numbers', 333, 333);
        testLiteralValues('strings', '"default-value"', 'default-value');
        testLiteralValues('functions', '() => 444 + "S"', '444S');
    });

    describe('mappers', function() {
        describe('transform queried or default values', function() {
            measurementProcessingTest
            ('for fields')
            ({
                myMeasurement: {
                    granularity: 'sample',
                    fields: {
                        queries: {
                            value: '$.sample[${constants.LATENCY}]'
                        },
                        mappers: {
                            value: 'v => v / 1000000'
                        }
                    }
                }
            })
            ((measurement, points) => {
                expect(measurement).to.equal('myMeasurement');
                expect(points[0][0]).to.deep.equal({ value: 0.000999 });
                expect(points[1][0]).to.deep.equal({ value: 0.000998 });
                expect(points[2][0]).to.deep.equal({ value: 0.000997 });
                expect(points.length).to.equal(3);
            });

            measurementProcessingTest
            ('for tags')
            ({
                myMeasurement: {
                    granularity: 'report',
                    fields: {
                        queries: {
                            value: '$.testReport.latencies[*][${constants.LATENCY}]'
                        }
                    },
                    tags: {
                        defaults: {
                            myTag: '"TEST"'
                        },
                        mappers: {
                            myTag: 't => `*${t}*`'
                        }
                    }
                }
            })
            ((measurement, points) => {
                expect(measurement).to.equal('myMeasurement');
                expect(points[0][1].myTag).to.deep.equal('*TEST*');
                expect(points.length).to.equal(1);
            });
        });
    });

    describe('reducers', function() {
        describe('reduce mapped, queried or default values', function() {
            measurementProcessingTest
            ('for fields')
            ({
                myMeasurement: {
                    granularity: 'report',
                    fields: {
                        queries: {
                            value: '$.testReport.latencies[*][${constants.LATENCY}]'
                        },
                        reducers: {
                            value: '(acc, value) => acc + value'
                        }
                    }
                }
            })
            ((measurement, points) => {
                expect(measurement).to.equal('myMeasurement');
                expect(points[0][0]).to.deep.equal({ value: 2994 });
                expect(points.length).to.equal(1);
            });

            measurementProcessingTest
            ('for tags')
            ({
                myMeasurement: {
                    granularity: 'report',
                    fields: {
                        queries: {
                            value: '$.testReport.latencies[*][${constants.LATENCY}]'
                        }
                    },
                    tags: {
                        queries: {
                            largest: '$.testReport.latencies[*][${constants.LATENCY}]'
                        },
                        mappers: {
                            largest: '(acc, value) => acc > value ? acc : value'
                        }
                    }
                }
            })
            ((measurement, points) => {
                expect(measurement).to.equal('myMeasurement');
                expect(points[0][1].largest).to.equal(999);
                expect(points.length).to.equal(1);
            });
        });
    });
});
