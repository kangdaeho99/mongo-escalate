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
    const { mongoUri, databaseName, collectionName } = req.body;
    let pipelineStr = req.body.pipeline;

    let pipeline = eval(pipelineStr);
    try {
        pipeline = eval(pipelineStr);
        if (!Array.isArray(pipeline)) {
            throw new Error("잘못된 파이프라인 형식");
        }
    } catch (error) {
        console.error("JSON parsing error:", error);
        return res.status(400).json({ message: "잘못된 파이프라인 형식" });
    }

    pipeline =  [
        {
            $match: {
                birthdate: { $gte: new Date("1990-01-01") }
            }
        },
        {
            $lookup: {
                from: "accounts",
                localField: "accounts",
                foreignField: "account_id",
                as: "account_details"
            }
        },
        {
            $unwind: "$account_details"
        },{
            $match: {
                name : "Elizabeth Ray"
            }
        },
        {
            $match: {
                "account_details.limit": { $gte: 1000 }
            }
        },
        {
            $project: {
                _id: 0,
                username: 1,
                name: 1,
                email: 1,
                accountLimit: "$account_details.limit"
            }
        }
    ]


    const fields = await getAllFiled(mongoUri, databaseName, collectionName);
    console.log(fields);

    const matchCategory = mergeMatch(pipeline, fields); // pipeline이 바뀜
    const canOptimizedFiled = await findDependentFields(mongoUri, databaseName, collectionName, pipeline);

    //console.log(matchCategory);
    console.log("Index")
    console.log(canOptimizedFiled);

    const result = {};
    result["pipeOptimize"] = ({
        optimizePipeline : pipeline,
        optimizeCategory : matchCategory
    })
    result["indexOptimize"] = (canOptimizedFiled);

    res.status(200).json(result);
}

/* Match 스테이지 분할된 경우 병합 처리.
 */
const mergeMatch = (pipeline, originFiled) => {
    const category = {
        isMerged: false,
        isChangedOrder: false
    };


    const matchStep = getFirstMatchIndex(pipeline);

    const matchIndexes = collectMatchIndexes(pipeline);
    const finalMatch = mergeMatchConditions(pipeline, matchIndexes, originFiled, category);
    removeOriginFilterMatches(pipeline, matchIndexes, originFiled);

    if (finalMatch && Object.keys(finalMatch).length > 0) {
        pipeline.unshift({ $match: finalMatch });
        console.log(getFirstMatchIndex(pipeline));
        if (matchStep !== getFirstMatchIndex(pipeline)) {
            category.isChangedOrder = true;
        }
    }

    if (finalMatch && (Object.keys(finalMatch).length > 1 || ('$and' in finalMatch && finalMatch.$and.length > 1))) {
        category.isMerged = true;
    }

    return category;
}

const getFirstMatchIndex = (pipeline) => {
    for (const [index, stage] of pipeline.entries()) {
        if (stage["$match"]) {
            return index;
        }
    }
    return -1;
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

const mergeMatchConditions = (pipeline, matchIndexes, originFiled, category) => {
    const mergedMatchConditions = {};
    let hasMergeableConditions = false;

    for (const i of matchIndexes) {
        const matchFiled = pipeline[i]["$match"];
        if (isOriginFilterMatch(matchFiled, originFiled)) {
            hasMergeableConditions = true;
            for (const [key, value] of Object.entries(matchFiled)) {
                if (!mergedMatchConditions[key]) {
                    mergedMatchConditions[key] = [value];
                } else {
                    mergedMatchConditions[key].push(value);
                }
            }
        }
    }

    if (!hasMergeableConditions) {
        return null;
    }

    const finalMatch = {};
    const andConditions = [];

    for (const [key, value] of Object.entries(mergedMatchConditions)) {
        if (value.length > 1) {
            const andCondition = value.map(v => ({ [key]: v }));
            andConditions.push({ $and: andCondition });
        } else {
            finalMatch[key] = value[0];
        }
    }

    if (andConditions.length > 0) {
        if (Object.keys(finalMatch).length > 0) {
            andConditions.push(finalMatch);
        }
        return { $and: andConditions };
    } else {
        return finalMatch;
    }
}

const removeOriginFilterMatches = (pipeline, matchIndexes, originFiled) => {
    for (const i of matchIndexes.reverse()) {
        const matchFiled = pipeline[i]["$match"];
        if (isOriginFilterMatch(matchFiled, originFiled)) {
            pipeline.splice(i, 1);
        }
    }
}


// 인덱스 필드 조회
const getIndexFields = async (mongoUri, databaseName, collectionName) => {
    const client = await connectToMongo(mongoUri);
    const database = client.db(databaseName);
    const collection = database.collection(collectionName);

    const indexes = await collection.indexes();
    const indexFields = indexes.flatMap(index => Object.keys(index.key));

    await client.close();
    return [...new Set(indexFields)];
}

// 함수적 종속성 찾기
const checkFunctionalDependency = async (mongoUri, databaseName, collectionName, usernameField) => {
    const client = await connectToMongo(mongoUri);
    const database = client.db(databaseName);
    const collection = database.collection(collectionName);

    const fields = await getAllFiled(mongoUri, databaseName, collectionName);
    const dependentFields = [];

    for (let field of fields) {
        if (field !== usernameField) {
            const pipeline = [
                {
                    $group: {
                        _id: `$${usernameField}`,
                        uniqueValues: { $addToSet: `$${field}` }
                    }
                },
                {
                    $match: { uniqueValues: { $size: 1 } }
                }
            ];

            const result = await collection.aggregate(pipeline).toArray();
            if (result.length > 0) {
                dependentFields.push(field);
            }
        }
    }

    await client.close();

    return dependentFields;
}

const extractMatchFields = (pipeline) => {
    const matchFields = new Set();

    for (const stage of pipeline) {
        if (stage["$match"]) {
            Object.keys(stage["$match"]).forEach(field => matchFields.add(field));
        }
    }

    return [...matchFields];
}

// 의존성 인덱스 필드 찾기
const findDependentFields = async (mongoUri, databaseName, collectionName, pipeline) => {
    const indexFields = await getIndexFields(mongoUri, databaseName, collectionName);
    console.log(`indexField ${indexFields}`);
    const matchFields = extractMatchFields(pipeline);
    console.log(`matchField ${matchFields}`);
    const result = [];

    for (let indexField of indexFields) {
        const dependentFields = await checkFunctionalDependency(mongoUri, databaseName, collectionName, indexField);
        console.log(dependentFields);

        dependentFields.forEach(dependentField => {
            if (matchFields.includes(dependentField)) {
                result.push({
                    dependentFiled: dependentField,
                    determinantField: indexField
                });
            }
        });
    }
    console.log(result);

    return result;
}

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