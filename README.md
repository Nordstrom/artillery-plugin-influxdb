# artillery-plugin-influxdb
Plugin for Artillery.IO that records response data into InfluxDB.

To use:

1. `npm install -g artillery`
2. `npm install artillery-plugin-influxdb`
3. Add `influxdb` plugin config to your "`hello.json`" Artillery script

    ```json
    {
      "config": {
        "plugins": {
          "influxdb": {
               // or single-host configuration
               host : 'localhost',
               port : 8086, // optional, default 8086
               protocol : 'http', // optional, default 'http'
               username : 'dbuser',
               password : 'f4ncyp4ass',
               database : 'my_database'
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
