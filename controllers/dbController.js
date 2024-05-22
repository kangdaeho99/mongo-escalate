const { MongoClient } = require("mongodb");

const connectToMongo = async (mongoUri) => {
    const client = new MongoClient(mongoUri);
    await client.connect();
    return client;
};

exports.connectMongo = async (req, res) => {
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
};

exports.aggregate = async (req, res) => {
    const { mongoUri, databaseName, collectionName, pipeline } = req.body;
    const uri = mongoUri;

    let evalData = eval(pipeline);
    try {
        const client = await connectToMongo(uri);
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        const results = await collection.aggregate(evalData).toArray();
        await client.close();
        res.status(200).json(results);
    } catch (error) {
        console.error("Aggregation 실행 중 오류 발생:", error);
        res.status(500).json({ message: "Aggregation 실행 중 오류 발생" });
    }
};

exports.explain = async (req, res) => {
    const { mongoUri, databaseName, collectionName, pipeline } = req.body;
    const uri = mongoUri || process.env.MONGO_URI;

    let evalData = eval(pipeline);
    try {
        const client = await connectToMongo(uri);
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);
        const explainResult = await collection.aggregate(evalData).explain();
        await client.close();
        res.status(200).json(explainResult);
    } catch (error) {
        console.error("Explain 실행 중 오류 발생:", error);
        res.status(500).json({ message: "Explain 실행 중 오류 발생" });
    }
};