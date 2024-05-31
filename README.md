# mongo-escalate
'mongo-escalate'는 Mongo DB와  상호 작용할 수 있는 Node.js 기반의 API를 제공합니다. 

# 데이터베이스 정보 가져오기
- MongoDB 데이터베이스 및 컬렉션 정보를 트리 구조로 반환

URL: `/api/v1/db/connect-mongo`  
Method: `POST`
Request Body:
```json
{
  "mongoUri": "mongodb+srv://example.mongodb.net/"
}
```
Response:  
Status Code: `200`  
Body: 
```json
{
  "treeData": [
    {
      "itemId": "db",
      "label": "db",
      "children": [
        {
          "itemId": "db-col",
          "label": "db.col"
        }
      ]
    }
  ]
}
```

실패 시:  
Status Code: `400 (잘못된 요청`) 또는 `500 (서버 오류)`
Body: 
```json
{ "message": "Error connecting to MongoDB" }
```




# Aggregation 파이프라인 실행

- 주어진 Aggregation 파이프라인을 실행하고 결과를 반환

URL: `/api/v1/db/aggregate`  
Method: `POST`  
Request Body:  
```json
{
  "mongoUri": "mongodb+srv://example.mongodb.net/",
  "databaseName": "myDatabase",
  "collectionName": "users",
  "pipeline": [
    {
      "$match": {
        "age": { "$gte": 18 }
      }
    },
    {
      "$group": {
        "_id": "$country",
        "count": { "$sum": 1 }
      }
    }
  ],
  "index" : 0
}
```
Response:  
Status Code: `200`
```json
[
  {
    "_id": "USA",
    "count": 50
  },
  {
    "_id": "Canada",
    "count": 30
  },
  {
    "_id": "UK",
    "count": 20
  }
]
```
# 부분 Aggregation 파이프라인 실행

- 주어진 Aggregation 파이프라인의 특정 단계까지만 실행하고 결과를 반환

## API Endpoint

URL: `/api/v1/db/aggregate/part`  
Method: `POST`

## Request Body

```json
{
  "mongoUri": "mongodb+srv://example.mongodb.net/",
  "databaseName": "myDatabase",
  "collectionName": "users",
  "pipeline": [
    {
      "$match": {
        "age": { "$gte": 18 }
      }
    },
    {
      "$group": {
        "_id": "$country",
        "count": { "$sum": 1 }
      }
    },
    {
      "$sort": { "count": -1 }
    }
  ],
  "step": 2
}
```



# Aggregation 실행 계획 가져오기

- 주어진 Aggregation 파이프라인의 실행 계획을 반환

URL: `/api/v1/db/explain`  
Method: `POST`  
Request Body:  
```json
{
  "mongoUri": "mongodb+srv://example.mongodb.net/",
  "databaseName": "myDatabase",
  "collectionName": "products",
  "pipeline": [
    {
      "$match": {
        "category": "electronics"
      }
    },
    {
      "$sort": {
        "price": -1
      }
    },
    {
      "$limit": 10
    }
  ]
}
```
Response:  
Status Code: `200`  
Body:  
```json
{
  "stages": [
    {
      "$cursor": {
        "query": {
          "category": "electronics"
        },
        "fields": {
          "_id": 1,
          "name": 1,
          "category": 1,
          "price": 1
        },
        "queryPlanner": {
          "plannerVersion": 1,
          "namespace": "myDatabase.products",
          "indexFilterSet": false,
          "parsedQuery": {
            "category": {
              "$eq": "electronics"
            }
          },
          "winningPlan": {
            "stage": "COLLSCAN",
            "filter": {
              "category": {
                "$eq": "electronics"
              }
            },
            "direction": "forward"
          }
        }
      }
    },
    {
      "$sort": {
        "sortKey": {
          "price": -1
        },
        "limit": 10
      }
    }
  ],
  "serverInfo": {
    "host": "cluster0-shard-00-01.mongodb.net",
    "port": 27017,
    "version": "4.4.0",
    "gitVersion": "563487e100c4215e2dce98d0af2a6a5a2d67c5cf"
  },
  "ok": 1
}
```

실패 시:
Status Code: `500 (서버 오류)`
Body:   
```json
{ "message": "Aggregation 실행 중 오류 발생" }
```

# Collection Schema 타입 조회

- 제공된 컬렉션의 스키마 변수명과 타입 조회

URL: `/api/v1/db/schema`  
Method: `POST`  
Request Body:
```json
{
  "mongoUri": "mongodb+srv://example.mongodb.net/",
  "databaseName" : "sample_analytics",
  "collectionName" :"transactions"
}
```
Response:  
Status Code: `200`  
Body:
```json
{
  "_id": {
    "BsonType": "ObjectId",
    "Index": {
      "hasIndex": false,
      "indexName": null
    },
    "Cardinality": 1746
  },
  "account_id": {
    "BsonType": "Int32",
    "Index": {
      "hasIndex": false,
      "indexName": null
    },
    "Cardinality": 1745
  },
  "transaction_count": {
    "BsonType": "Int32",
    "Index": {
      "hasIndex": false,
      "indexName": null
    },
    "Cardinality": 100
  },
  "bucket_start_date": {
    "BsonType": "Date",
    "Index": {
      "hasIndex": false,
      "indexName": null
    },
    "Cardinality": 1626
  },
  "bucket_end_date": {
    "BsonType": "Date",
    "Index": {
      "hasIndex": false,
      "indexName": null
    },
    "Cardinality": 232
  },
  "transactions": {
    "BsonType": "Array",
    "Index": {
      "hasIndex": false,
      "indexName": null
    },
    "Cardinality": 1746
  }
}

```

실패 시:
Status Code: `500 (서버 오류)` 또는  `400 (잘못된 요청)`
Body:
```json
{ "message": "schema 조회시 오류 발생" }
```