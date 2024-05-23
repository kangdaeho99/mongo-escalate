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
    let index = req.body.index;
    const uri = mongoUri;

    let evalData;
    try {
        evalData = eval(pipeline);
    } catch (error) {
        console.error("JSON parsing error:", error);
        return res.status(400).json({ message: "잘못된 파이프라인 형식" });
    }
    const hasLimit = evalData.some(stage => Object.hasOwnProperty.call(stage, '$limit'));
    const hasSkip = evalData.some(stage => Object.hasOwnProperty.call(stage, '$skip'));

    if (!hasLimit) {
        evalData.push({ $limit: 10 });
    }

    if (index === undefined) {
        index = 0;
    }
    if (!hasSkip) {
        evalData.push({ $skip: index });
    }
    
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

exports.recommend = async (req, res) => {
    const { mongoUri, databaseName, collectionName, pipeline } = req.body;
    const uri = mongoUri;

    let evalData;
    try {
        evalData = eval(pipeline);
    } catch (error) {
        console.error("JSON parsing error:", error);
        return res.status(400).json({ message: "잘못된 파이프라인 형식" });
    }

    try {
        const cardinalities = await getCollectionCardinality(uri, databaseName, collectionName);
        const cardinalityMap = cardinalities.reduce((map, item) => {
            map[item._id] = item.cardinality;
            return map;
        }, {});

        const matchStage = evalData.find(stage => Object.hasOwnProperty.call(stage, '$match'));

        const matchCardinalities = {};
        if (matchStage) {
            for (const [key, value] of Object.entries(matchStage['$match'])) {
                if (key !== '_id') {
                    matchCardinalities[key] = cardinalityMap[key];
                }
            }
        }
        matchCardinalities["_id"] = cardinalityMap["_id"];

        let maxCardinality = 0;
        let bestIndexKey = null;
        for (const [key, value] of Object.entries(matchCardinalities)) {
            if (key !== '_id' && value > maxCardinality) {
                maxCardinality = value;
                bestIndexKey = key;
            }
        }

        res.status(200).json({bestIndexKey, maxCardinality, matchCardinalities});
    } catch (error) {
        console.error("Aggregation 실행 중 오류 발생:", error);
        res.status(500).json({ message: "Aggregation 실행 중 오류 발생" });
    }
};

exports.getCardinality = async (req, res) => {
    const { mongoUri, databaseName, collectionName } = req.body;

    try {
        const cardinality = await getCollectionCardinality(mongoUri, databaseName, collectionName);
        res.status(200).json(cardinality);
    } catch (error) {
        console.error("카디널리티 계산 중 오류 발생:", error);
        res.status(500).json({ message: "카디널리티 계산 중 오류 발생" });
    }
};

const getCollectionCardinality = async (uri, databaseName, collectionName) => {
    const client  = await connectToMongo(uri);

    try {
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);

        const pipeline = [
            {
                $project: {
                    document: "$$ROOT"
                }
            },
            {
                $unwind: {
                    path: "$document",
                    includeArrayIndex: 'string'
                }
            },
            {
                $replaceRoot: { newRoot: "$document" }
            },
            {
                $group: {
                    _id: "$_id",
                    keys: { $mergeObjects: "$$ROOT" }
                }
            },
            {
                $project: {
                    keys: { $objectToArray: "$keys" }
                }
            },
            {
                $unwind: "$keys"
            },
            {
                $group: {
                    _id: "$keys.k",
                    uniqueValues: { $addToSet: "$keys.v" }
                }
            },
            {
                $project: {
                    _id: 1,
                    cardinality: { $size: "$uniqueValues" }
                }
            }
        ];

        const result = await collection.aggregate(pipeline).toArray();
        return result;
    } catch (error) {
        console.error("schema 조회시 오류 발생:", error);
        throw new Error("schema 조회시 오류 발생");
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