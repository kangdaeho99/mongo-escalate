const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");

const app = express();
const port = 3001;

const corsOptions = {
    origin: "http://localhost:3000",
    methods: ["POST", "GET", "DELETE", "PATCH", "PUT"],
};

app.use(cors(corsOptions));
app.use(express.json());

const connectToMongo = async (mongoUri) => {
    const client = new MongoClient(mongoUri);
    await client.connect();
    return client;
};
    /**
     * [2024-05-17 daeho.kang]
     * Description: Get databaseList, Collections (Retrieve DB Information by mongoUri.)
     * 
     * Request Example : Send mongoUri
     * {
            "mongoUri":"mongodb://localhost:27017"
        }
     * 
        Response Example : Respond DB Name, Collections
        {
            "treeData": [
                {
                    "itemId": "admin",
                    "label": "admin",
                    "children": [
                        {
                            "itemId": "admin-system.version",
                            "label": "system.version"
                        }
                    ]
                },
                {
                    "itemId": "config",
                    "label": "config",
                    "children": [
                        {
                            "itemId": "config-system.sessions",
                            "label": "system.sessions"
                        }
                    ]
                },
                {
                    "itemId": "local",
                    "label": "local",
                    "children": [
                        {
                            "itemId": "local-startup_log",
                            "label": "startup_log"
                        }
                    ]
                }
            ]
        }

     */
app.post("/api/v1/db/connect-mongo", async (req, res) => {
    const mongoUri = req.body.mongoUri;

    if (!mongoUri) {
        return res.status(400).json({ message: "mongoUri is required" });
    }

    try {
        const client = await connectToMongo(mongoUri);
        const databaseList = await client.db().admin().listDatabases();

        let treeData = [];
        for (let database of databaseList.databases) {
            const db = client.db(database.name);
            const collections = await db.listCollections().toArray();
            const children = collections.map((collection) => {
                return {
                    itemId: `${database.name}-${collection.name}`,
                    label: collection.name,
                };
            });

            treeData.push({
                itemId: database.name,
                label: database.name,
                children: children,
            });
        }

        await client.close();
        res.status(200).json({ treeData: treeData });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Error connecting to MongoDB" });
    }
});

app.post("/api/v1/db/aggregate", async (req, res) => {
    const { mongoUri, databaseName, collectionName, pipeline } = req.body;
    const uri = mongoUri;

    let evalData = eval(pipeline);
    // console.log(typeof(evalData), JSON.stringify(evalData, null, 2))
    try {
        const client = await connectToMongo(uri);
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        // const results = await collection.aggregate(pipeline).toArray();
        const results = await collection.aggregate(evalData).toArray();
        await client.close();
        res.status(200).json(results);
    } catch (error) {
        console.error("Aggregation 실행 중 오류 발생:", error);
        res.status(500).json({ message: "Aggregation 실행 중 오류 발생" });
    }
});

app.post("/api/v1/db/explain", async (req, res) => {
    const { mongoUri, databaseName, collectionName, pipeline } = req.body;
    const uri = mongoUri || process.env.MONGO_URI;

    let evalData = eval(pipeline);
    // console.log(typeof(evalData), JSON.stringify(evalData, null, 2))
    try {
        const client = await connectToMongo(uri);
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        // const explainResult = await collection
        //     .aggregate(pipeline)
        //     .explain("executionStats");

        // const explainResult = await collection
        //     .aggregate(evalData)
        //     .explain("executionStats");
        const explainResult = await collection
                .aggregate(evalData)
                .explain();

        await client.close();
        res.status(200).json(explainResult);
    } catch (error) {
        console.error("Explain 실행 중 오류 발생:", error);
        res.status(500).json({ message: "Explain 실행 중 오류 발생" });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
