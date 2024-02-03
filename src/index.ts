import * as Realm from 'realm-web';
import * as utils from './utils';

// The Worker's environment bindings. See `wrangler.toml` file.
interface Bindings {
    // MongoDB Realm Application ID
    REALM_APPID: string;
}

// Define type alias; available via `realm-web`
type Document = globalThis.Realm.Services.MongoDB.Document;

// Declare the interface for a "shopping_list" document
interface ShoppingList extends Document {
    name: string;
    purchased: boolean;
    quantity: string;
}

let App: Realm.App;
const ObjectId = Realm.BSON.ObjectID;

// Define the Worker logic
const worker: ExportedHandler<Bindings> = {
    async fetch(req, env) {
        const url = new URL(req.url);
        App = App || new Realm.App(env.REALM_APPID);

        const method = req.method;
        const path = url.pathname.replace(/[/]$/, '');
        const itemID = url.searchParams.get('id') || '';
        

        if (path !== '/api/shopping_list') {
            return utils.toError(`Unknown "${path}" URL; try "/api/shopping_list" instead.`, 404);
        }

        const token = req.headers.get('authorization');
        if (!token) return utils.toError('Missing "authorization" header; try to add the header "authorization: REALM_API_KEY".', 401);

        try {
            const credentials = Realm.Credentials.apiKey(token);
            // Attempt to authenticate
            var user = await App.logIn(credentials);
            var client = user.mongoClient('mongodb-atlas');
        } catch (err) {
            return utils.toError('Error with authentication.', 500);
        }

        // Grab a reference to the "cloudflare.shopping_list" collection
        const collection = client.db('cloudflare').collection<ShoppingList>('shopping_list');

        try {
            if (method === 'GET') {
                if (itemID) {
                    // GET /api/shopping_list?id=XXX
                    return utils.reply(
                        await collection.findOne({
                            _id: new ObjectId(itemID)
                        })
                    );
                }

                // GET /api/shopping_list
                return utils.reply(
                    await collection.find()
                );
            }

            // POST /api/shopping_list
            if (method === 'POST') {
                const {name, purchased, quantity} = await req.json();
                return utils.reply(
                    await collection.insertOne({
                        name: name,
                        purchased: purchased || false,
                        quantity: quantity,
                    })
                );
            }

            // PATCH /api/shopping_list?id=XXX/toggle
            if (method === 'PATCH') {
                try {
                    // Fetch the document from the MongoDB collection
                    const existingDocument = await collection.findOne({ _id: new ObjectId(itemID) });

                    // If the document exists, toggle the 'purchased' value
                    if (existingDocument) {
                        const updatedPurchasedValue = !existingDocument.purchased;

                        // Update the document in the MongoDB collection
                        const result = await collection.updateOne(
                            { _id: new ObjectId(itemID) },
                            { $set: { purchased: updatedPurchasedValue } }
                        );

                        // Handle the result as needed
                        return utils.reply(result);
                    } else {
                        // Handle the case when the document does not exist
                        return utils.toError('Document not found', 404);
                    }
                } catch (err) {
                    // Handle errors
                    return utils.toError('Internal Server Error', 500);
                }
            }

            if (method === 'PUT') {
                try {
                    // Fetch the updated fields from the request body
                    const { name, purchased, quantity } = await req.json();
        
                    // Construct the update object based on provided fields
                    const updateObject: ShoppingList = {
                        name, purchased, quantity,
                        _id: undefined
                    }; 
        
                    if (name !== undefined) {
                        updateObject.name = name;
                    }
        
                    if (purchased !== undefined) {
                        updateObject.purchased = purchased;
                    }
        
                    if (quantity !== undefined) {
                        updateObject.quantity = quantity;
                    }
        
                    // Update the document in the MongoDB collection
                    const result = await collection.updateOne(
                        { _id: new ObjectId(itemID) },
                        { $set: updateObject }
                    );
        
                    // Handle the result as needed
                    return utils.reply(result);
                } catch (err) {
                    // Handle errors
                    return utils.toError('Internal Server Error', 500);
                }
            }

            // DELETE /api/shopping_list?id=XXX
            if (method === 'DELETE') {
                return utils.reply(
                    await collection.deleteOne({
                        _id: new ObjectId(itemID)
                    })
                );
            }

            // unknown method
            return utils.toError('Method not allowed.', 405);
        } catch (err) {
            const msg = (err as Error).message || 'Error with query.';
            return utils.toError(msg, 500);
        }
    }
}

// Export for discoverability
export default worker;
