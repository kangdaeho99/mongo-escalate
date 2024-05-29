const { MongoClient} = require("mongodb");

const connectToMongo = async (mongoUri) => {
    try {
        const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 });
        await client.connect();
        return client;
    } catch (error) {
        throw error;
    }
};

exports.optimizePipeline = async (req, res) => {
    const { mongoUri, databaseName, collectionName, pipeline } = req.body;

    const fields = await getAllFiled(mongoUri, databaseName, collectionName);
    console.log(fields);

    res.status(200).json(fields);
}

// 순서 오류

// match를 위로


// 분할 오류

const getAllFiled = async (mongoUri, databaseName, collectionName) => {
    const client = await connectToMongo(mongoUri);
    const database = client.db(databaseName);
    const collection = database.collection(collectionName);

    const pipeline = [
        { $project:
                { arrayofkeyvalue: { $objectToArray: "$$ROOT" } } },
        { $unwind: "$arrayofkeyvalue" },
        { $group:
                { _id: null, allkeys: { $addToSet: "$arrayofkeyvalue.k" } }
        },
        {$project: {
                _id : 0
            }}
    ]

    const result = await collection.aggregate(pipeline).toArray();

    await client.close();

    return result.length > 0 ? result[0].allkeys : [];
}