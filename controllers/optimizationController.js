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
// match가 맨 앞
// lookup, match 구분해서 순서 조정

const checkMatch = (pipeline) => {

    for (const [index, stage] of pipeline.entries()) {
        console.log(index, stage);
    }
}


/* Match 스테이지 분할된 경우 병합 처리.
 */
const mergeMatch = (pipeline, originFiled) => {
    const matchIndexes = collectMatchIndexes(pipeline);
    const finalMatch = mergeMatchConditions(pipeline, matchIndexes, originFiled);
    removeOriginFilterMatches(pipeline, matchIndexes, originFiled);

    if (finalMatch.$and.length > 0) {
        pipeline.unshift({ $match: finalMatch });
    }
}


const collectMatchIndexes = (pipeline) => {
    const matchIndexes = [];
    for (const [index, stage] of pipeline.entries()) {
        if (stage["$match"]) {
            matchIndexes.push(index);
        }
    }
    return matchIndexes;
}

const isOriginFilterMatch = (matchFiled, originFiled) => {
    for (const key of Object.keys(matchFiled)) {
        if (!originFiled.includes(key)) {
            return false;
        }
    }
    return true;
}

const mergeMatchConditions = (pipeline, matchIndexes, originFiled) => {
    const mergedMatchConditions = {};
    for (const i of matchIndexes) {
        const matchFiled = pipeline[i]["$match"];
        if (isOriginFilterMatch(matchFiled, originFiled)) {
            for (const [key, value] of Object.entries(matchFiled)) {
                if (!mergedMatchConditions[key]) {
                    mergedMatchConditions[key] = [value];
                } else {
                    mergedMatchConditions[key].push(value);
                }
            }
        }
    }

    const finalMatch = { $and: [] };
    for (const [key, value] of Object.entries(mergedMatchConditions)) {
        if (value.length > 1) {
            const andConditions = value.map(v => ({ [key]: v }));
            finalMatch.$and.push({ $and: andConditions });
        } else {
            finalMatch.$and.push({ [key]: value[0] });
        }
    }
    return finalMatch;
}

const removeOriginFilterMatches = (pipeline, matchIndexes, originFiled) => {
    for (const i of matchIndexes.reverse()) {
        const matchFiled = pipeline[i]["$match"];
        if (isOriginFilterMatch(matchFiled, originFiled)) {
            pipeline.splice(i, 1);
        }
    }
}

// 테스트를 위해 예제 파이프라인과 필드를 정의
const pipeline = [
    { $match: { limit: { $gte: 5000 } } },
    { $match: { limit: { $lte: 7000 } } },
    { $match: { field1: "value1" } },
    { $match: { field2: "value2" } },
    {
        $projct : { "_id" : 0}
    },
    { $match: { field1: { $gte: 10 } } }
]

const originFiled = ["field1", "field2", "limit"];

mergeMatch(pipeline, originFiled);

console.log(JSON.stringify(pipeline, null, 2));


/* 전체 컬렉션 필드 목록 조회
 */
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