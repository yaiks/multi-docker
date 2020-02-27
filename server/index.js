const keys = require("./keys");

// Starting Express App
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Starting Postgres connection
const { Pool } = require("pg");

const pgClient = new Pool({
	user: keys.pgUser,
	host: keys.pgHost,
	database: keys.pgDatabase,
	password: keys.pgPassword,
	port: keys.pgPort
});

pgClient.on("error", () => console.log("Lost PG connection"));

// creating a table named values, with a single column called number
pgClient
	.query("CREATE TABLE IF NOT EXISTS values (number INT)")
	.catch(err => console.log(err));

// Redis client setup
const redis = require("redis");

const redisClient = redis.createClient({
	host: keys.redisHost,
	port: keys.redisPort,
	retry_strategy: () => 1000
});

// need to define duplicate because when you have a redis client listening or subscribing, it need to be
// used only to that purpose
const redisPublisher = redisClient.duplicate();

// express route handlers
app.get("/", (req, res) => {
	res.send("Hi");
});

// route to get all previous numbers from postgres
app.get("/values/all", async (req, res) => {
	const values = await pgClient.query("SELECT * FROM values");

	// only return the relevant information
	res.send(values.rows);
});

// route to get the number and fibonacci result from Redis
app.get("/values/current", async (req, res) => {
	redisClient.hgetall("values", (err, values) => {
		res.send(values);
	});
});

// route to post
app.post("/values", async (req, res) => {
	const index = req.body.index;

	if (parseInt(index) > 40) {
		return res.send(422).send("Index too high");
	}

	// put value into Redis, the value is a placeholder and will be replaced with the calculcated fibonaci
	redisClient.hset("values", index, "Nothing yet");
	// publish a new insert, index will be sent as a message to the worker process
	redisPublisher.publish("insert", index);
	// store indexes in Postgres
	pgClient.query("INSERT INTO values(number) VALUES($1)", [index]);

	res.send({ working: true });
});

app.listen(5000, err => {
	console.log("listening");
});
