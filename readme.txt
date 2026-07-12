Fog and Edge Computing (H9FECC) - CA Project
National College of Ireland

This repository contains 22 independent implementations of the same brief
(FEC Project Descript.md), each with a different domain, sensor set, tech
stack, and dashboard design. Every project is fully self-contained under
projects/ with its own readme.txt, tests, docker-compose stack, and CI
workflow. Stack split: Python x7, Java x8, Node.js x7.

Common architecture across all 22: sensors -> fog node (windowed
aggregation + threshold alerting) -> SQS -> Lambda -> DynamoDB ->
dashboard, running on Docker/LocalStack, each on its own set of ports.

PROJECTS
--------
  01 smart-agriculture                    (Python)   port 8080
    soil moisture, temperature, humidity, light intensity, rainfall

  02 industrial-equipment                 (Java)     port 8081
    vibration, motor temperature, bearing acoustic emission,
    rotation speed, power draw

  03 patient-vitals                       (Node.js)  port 8082
    heart rate, SpO2, body temperature, respiration rate, systolic BP

  04 smart-city                           (Java)     port 8083
    vehicle count, air quality (PM2.5), noise level, parking occupancy,
    ambient light

  05 cold-chain-logistics                 (Python)   port 8084
    storage temperature, humidity, door-open seconds, shock/vibration,
    CO2 level

  06 offshore-wind-farm                   (Node.js)  port 8085
    wind speed, blade vibration, generator temperature, power output,
    gearbox pressure

  07 warehouse-robotics-fleet             (Java)     port 8086
    battery level, payload weight, motor temperature, position drift,
    task queue depth

  08 retail-footfall-inventory            (Java)     port 8087
    footfall count, shelf stock, fridge temperature, queue length,
    energy draw

  09 aquaculture-fish-farm                (Java)     port 8088
    water temperature, dissolved oxygen, pH level, ammonia, feed dispensed

  10 wildfire-forest-monitoring           (Node.js)  port 8089
    temperature, humidity, smoke density, wind speed, soil moisture

  11 water-treatment-utility              (Node.js)  port 8090
    turbidity, pH level, chlorine, flow rate, pressure

  12 smart-building-energy                (Python)   port 8091
    energy consumption, CO2, occupancy count, HVAC temperature,
    water usage

  13 ev-charging-network                  (Python)   port 8092
    charging current, battery state of charge, station temperature,
    grid load, session duration

  14 smart-parking-management             (Python)   port 8093
    occupied spaces, entry rate, exit rate, average dwell time,
    gate fault events

  15 data-center-environmental-monitoring (Node.js)  port 8094
    temperature, humidity, airflow, power load, dust density
    Individually authored by student Nithin (ID X25125338) as a
    separate submission; also uses a real AWS API Gateway + Lambda
    backend, unlike every other project in this repository.

  16 public-transit-fleet-monitoring      (Java)     port 8095
    engine temperature, brake pad wear, passenger count, fuel level,
    GPS speed

  17 solar-farm-monitoring                (Python)   port 8096
    irradiance, panel temperature, inverter output, DC voltage,
    soiling index

  18 elevator-escalator-fleet-monitoring  (Node.js)  port 8097
    motor temperature, door cycle count, cab vibration, load weight,
    travel speed

  19 smart-mining-safety                  (Java)     port 8098
    methane, carbon monoxide, dust concentration, ground vibration,
    ambient temperature

  20 smart-port-container-terminal        (Java)     port 8099
    crane load, container stack height, wind speed, berth occupancy,
    reefer temperature

  21 bridge-structural-health             (Python)   port 8100
    strain, deck vibration, tilt angle, traffic load, expansion
    joint movement

  22 smart-waste-management               (Node.js)  port 8101
    fill level, internal temperature, gas level, bin weight,
    lid open count

See each project's own readme.txt for setup, run, and test instructions.
Each project's LocalStack port is its dashboard port minus 3514
(e.g. project 01: dashboard 8080, LocalStack 4566).
