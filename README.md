# artillery-Plugin-influxdb
Plugin for Artillery.IO that records response data into InfluxDB.

To use:

1. `npm install -g artillery`
2. `npm install artillery-plugin-influxdb`
3. Add `influxdb` Plugin config to your "`hello.json`" Artillery script

    ```json
    {
      "config": {
        "plugins": {
            "influxdb": {
                "test_name": "my_load_test_case",
                "influx": {
                    "host": "my.influx.server.com",
                    "username": "joe_developer",
                    "password": "1t`sA$3cr3t",
                    "database": "load_test_results"
                }
            }
        }
      }
    }
    ```

4. `artillery run hello.json`

This will cause every latency to be published to the given InfluxDB instance.

For more information, see:

* https://github.com/shoreditch-ops/artillery
* https://github.com/node-influx/node-influx

Enjoy!
