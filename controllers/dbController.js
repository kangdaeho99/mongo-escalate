const { MongoClient, ObjectId, Binary, Decimal128, MongoParseError, MongoNetworkError, MongoServerSelectionError} = require("mongodb");
const dns = require("dns").promises;

const connectToMongo = async (mongoUri) => {
    try {
        const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 });
        await client.connect();
        return client;
    } catch (error) {
        throw error;
    }
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

        if (e instanceof MongoParseError) {
            res.status(400).json({ message: "올바르지않은 DB 정보입니다." });
            return ;
        }
        if (e instanceof MongoNetworkError) {
            const publicIp = await getPublicIp("ec2-13-125-76-129.ap-northeast-2.compute.amazonaws.com");
            return res.status(403).json({ message: "DB 접근이 거부당했습니다.", publicIp: publicIp });
        }
        if (e instanceof MongoServerSelectionError) {
            const publicIp = await getPublicIp("ec2-13-125-76-129.ap-northeast-2.compute.amazonaws.com");
            return res.status(403).json({ message: "DB 접근이 거부당했습니다.", publicIp: publicIp });
        }

        res.status(500).json({ message: "DB 접속 실패", error: e.message });
    }
};

const getPublicIp = async (hostname) => {
    try {
        const addresses = await dns.lookup(hostname);
        return addresses.address;
    } catch (error) {
        console.error(`Failed to lookup IP for ${hostname}:`, error);
        return null;
    }
};

exports.aggregate = async (req, res) => {
    const { mongoUri, databaseName, collectionName, pipeline } = req.body;
    let index = req.body.index;
    const uri = mongoUri;

    let evalData;
    try {
        evalData = eval(pipeline);
        if (!Array.isArray(evalData)) {
            throw new Error("잘못된 파이프라인 형식");
        }
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

/* 전체 컬렉션 스키마 조회
 * 컬렉션 속성 종류와 타입만 조회
 */
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

        const indexes = await collection.listIndexes().toArray();
        const indexMap = indexes.reduce((map, index) => {
            for (const key in index.key) {
                map[key] = index;
            }
            return map;
        }, {});

        const cardinalities = await getCollectionCardinality(uri, databaseName, collectionName);
        const cardinalityMap = cardinalities.reduce((map, item) => {
            map[item._id] = item.cardinality;
            return map;
        }, {});

        const schema = extractSchema(sampleDoc, indexMap, cardinalityMap);
        res.status(200).json(schema);

    } catch (error) {
        console.error("schema 조회시 오류 발생:", error);
        res.status(500).json({ message: "schema 조회시 오류 발생" });
    } finally {
        await client.close();
    }
}

/* 인덱스 추천
 * 카디널리티 기반 계산 */
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


/* 인덱스 생성
 */
exports.createIndexOnKey = async (req, res) => {
    const { mongoUri, databaseName, collectionName, targetKey } = req.body;

    const client  = await connectToMongo(mongoUri);

    try {
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);

        const result = await collection.createIndex({ [targetKey]: 1 });
    } catch (error) {
        console.error("인덱스 생성 시 오류 발생:", error);
        throw new Error("인덱스 생성 시 오류 발생");
    } finally {
        await client.close();
    }

}

/* 컬렉션 카디널리티 반환 받기
 */
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

/* 컬렉션의 모든 필드에 대한 카디널리티 계산
 */
const getCollectionCardinality = async (uri, databaseName, collectionName) => {
    const client  = await connectToMongo(uri);

    try {
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);

        // 컬렉션의 첫 번째 문서 가져오기
        const sampleDoc = await collection.findOne();

        if (!sampleDoc) {
            console.log(`${collectionName} 컬렉션에 문서가 없습니다.`);
            return [];
        }

        // 문서의 모든 필드에 대한 카디널리티 계산
        const cardinalities = [];
        for (const field in sampleDoc) {
            try {
                const cardinality = await getFieldCardinality(uri, databaseName, collectionName, field);
                cardinalities.push({ _id: field, cardinality });
            } catch (error) {
                console.error(`${field} 필드의 카디널리티 계산 중 오류 발생:`, error);
                cardinalities.push({ _id: field, cardinality: 0 });
            }
        }

        return cardinalities;
    } catch (error) {
        console.error("카디널리티 계산 중 오류 발생:", error);
        throw new Error("카디널리티 계산 중 오류 발생");
    } finally {
        await client.close();
    }
}

/* 특정 필드의 카디널리티 계산
 */
const getFieldCardinality = async (uri, databaseName, collectionName, field) => {
    const client  = await connectToMongo(uri);

    try {
        const database = client.db(databaseName);
        const collection = database.collection(collectionName);

        const pipeline = [
            {
                $group: {
                    _id: `$${field}`,
                }
            },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 }
                }
            }
        ];

        const result = await collection.aggregate(pipeline).toArray();
        return result[0] ? result[0].count : 0;
    } catch (error) {
        console.error(`${field} 필드의 카디널리티 계산 중 오류 발생:`, error);
        throw new Error(`${field} 필드의 카디널리티 계산 중 오류 발생`);
    } finally {
        await client.close();
    }
}

const extractSchema = (doc, indexMap, cardinalityMap) => {
    const schema = {};
    for (const key in doc) {
        if (doc.hasOwnProperty(key)) {
            const indexes = [];
            for (const indexKey in indexMap) {
                if (indexKey.startsWith(key + '.') || indexKey === key) {
                    indexes.push({
                        hasIndex: true,
                        indexName: indexMap[indexKey].name
                    });
                }
            }
            schema[key] = {
                BsonType: getBsonType(doc[key]),
                Index: indexes.length > 0 ? indexes : [{
                    hasIndex: false,
                    indexName: null
                }],
                Cardinality: cardinalityMap[key] || null
            };
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
    if (Number.isInteger(value)) {
        if (Number.isSafeInteger(value)) {
            return 'Int32';
        } else {
            return 'Int64';
        }
    }
    if (typeof value === 'number') {
        return 'Double';
    }
    if (typeof value === 'boolean') {
        return 'Boolean';
    }
    if (value instanceof Date) {
        return 'Date';
    }
    if (value instanceof ObjectId) {
        return 'ObjectId';
    }
    if (value instanceof Binary) {
        return 'Binary';
    }
    if (value instanceof Decimal128) {
        return 'Decimal128';
    }
    if (typeof value === 'object' && value !== null) {
        if (value.$numberDecimal !== undefined) {
            return 'Decimal128';
        }
        return 'Object';
    }
    return 'Unknown';
}