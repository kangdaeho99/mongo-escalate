const { MongoClient } = require("mongodb");
const tty = require("tty");

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

exports.getSampleSchema = async (req, res) => {
    const { mongoUri, databaseName, collectionName } = req.body;
    const uri = mongoUri || process.env.MONGO_URI;

    const client  = await connectToMongo(uri);

    try {
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);

        const sampleDoc = await collection.findOne();

        if (!sampleDoc) {
            console.log(`${collectionName} 컬렉션에 문서가 없습니다.`);
            return;
        }

        const schema = extractSchema(sampleDoc);
        console.log(schema);
        res.status(200).json(schema);

    } catch (error) {
        console.error("schema 조회시 오류 발생:", error);
        res.status(500).json({ message: "schema 조회시 오류 발생" });
    } finally {
        await client.close();
    }
}

const extractSchema = (doc) => {
    const schema = {};
    for (const key in doc) {
        if (doc.hasOwnProperty(key)) {
            schema[key] = { BsonType: getBsonType(doc[key]) };
        }
    }
    return schema;
}

const getBsonType = (value) => {
    if (Array.isArray(value)) {
        return 'Array';
    }
    if (typeof value === 'string') {
        return 'String';
    }
    if (typeof value === 'number') {
        return 'Number'; // 정수 및 부동 소수점 모두 'Int'로 처리 (필요 시 세분화 가능)
    }
    if (typeof value === 'boolean') {
        return 'Boolean';
    }
    if (value instanceof Date) {
        return 'Date';
    }
    if (typeof value === 'object') {
        return 'Object';
    }
    return 'Unknown';
}