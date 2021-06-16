const dotenv = require('dotenv');
dotenv.config();
const app = require('express')(),
      bodyParser = require('body-parser'),
      request = require('request-promise');

const http = require('http');

const hostname = '0.0.0.0';
const port = process.env.PORT || 5000;

app.use(bodyParser.json());


/**
 *  Your App framework
 */
 const myApp = {
    /**
     *  Return a contact found in your Database
     *  @phoneNumber: the contact phoneNumber, e164 formatted
     */
     getContact: async (phoneNumber) => {
      // TODO: Search for a contact in your Database here
      // and set the contactFetched variable:

      const options = {
        method: 'POST',
        url: 'https://api.hubapi.com/crm/v3/objects/contacts/search',
        qs: {hapikey: process.env.HS_API_KEY},
        headers: {accept: 'application/json', 'content-type': 'application/json'},
        body: {
          filterGroups: [{filters: [{value: phoneNumber.replace(/\s/g, ""), propertyName: 'phone', operator: 'EQ'}]}],
          properties: ['firstname', 'hubspot_owner_id'],
          limit: 1,
          after: 0
        },
        json: true
      };
      
      try {
        return await request(options, function (error, response, body) {
        if (error) throw new Error(error);
        }).promise();
  
      } catch (error) {
        console.log("Error: ", error);
      }
    },
  
    /**
     *  Match a contact to an agent
     *  Return the agent email
     *  @contact: a contact ID of your own
     */
    getAssociatedAgentEmail: async (contact) => {
      // TODO: Match the associated agent with the contact param
      // and set the associatedAgentEmail variable:

      var optionsOwner = {
        method: 'GET',
        url: `https://api.hubapi.com/crm/v3/owners/${contact}`,
        qs: {idProperty: 'id', archived: 'false', hapikey: process.env.HS_API_KEY},
        headers: {accept: 'application/json'}
      };
      
      try {
        return await request(optionsOwner, function (error, response, body) {
        if (error) throw new Error(error);
        }).promise();
  
      } catch (error) {
        console.log("Error: ", error);
      }
    },
  
    /**
     *  Match a contact to an agent
     *  @agentEmail: your agent email address
     */
    getAgentAircallID: (agentEmail, callback) => {
      // Populate Aircall API url with API_ID ann API_TOKEN
      const uri = `https://${process.env.API_ID}:${process.env.API_TOKEN}@api.aircall.io/v1/users`;
  
      try {
        request.get(uri, (error, response, body) => {
          // We use ES6 `Array.prorotype.find` function to find
          // a user in the body.users array:
          const data = JSON.parse(body);
          const agent = data.users.find((user) => {
            return user.email === agentEmail;
          });

          if(agent === undefined) {
            console.log("No agent found on Aircall, aborting redirection.");
            console.log("------------------------------");
            return;
          }

          console.log("Agent availability status: ", agent.availability_status);
          console.log("Agent available status: ", agent.available);

          // Check agent status
          if(agent.available && agent.availability_status === 'available') {
            callback(agent.id);
          } else {
            console.log("Agent not available, aborting redirection.")
            console.log("------------------------------");
            return;
          }
        });
      } catch (error) {
        console.log("Error: ", error);
      }
      
    },
  
    /**
     *  Forward a call to a user
     *  @callId: the call you want to be transferred
     *  @userId: the user you want to forward the call to
     */
    forwardCall: (callId, userId) => {
      // Populate Aircall API url with API_ID ann API_TOKEN
      const uri = `https://${process.env.API_ID}:${process.env.API_TOKEN}@api.aircall.io/v1/calls/${callId}/transfers`;
  
      try {
        request.post(uri,
          {
            json: {
              user_id: userId
            }
          },
          (error, response, body) => {
            console.log(`Call ${callId} transferred to ${userId}`);
            console.log("------------------------------");
          }
        );
      } catch (error) {
        console.log("Error: ", error);
      }
      
    }
  };
  
  
  /**
   *  [GET] / route will show a basic JSON file
   */
  app.get('/', (req, res) => {
    res.json({'message': 'Server is running'});
  });
  
  
  /**
   *  [POST] /aircall/calls will listen to Aircall webhook
   */
  app.post('/aircall/calls', (req, res) => {
    if (req.body.event === 'call.created') {
      if (req.body.data.direction === 'inbound') {
        console.log("------------------------------");
        console.log("Inbound call! Phone: " + req.body.data.raw_digits.replace(/\s/g, ""));
        
        // 1. Get the caller contact:
        myApp.getContact(req.body.data.raw_digits).then(data => {

          // If contact doesnt exists
          if(data.results.length === 0) {
            console.log('User not found on Hubspot, aborting redirection.');
            console.log("------------------------------");
            return;
          }
          
          console.log("User found on Hubspot: ", data.results[0].properties.firstname);

          if(data.results[0].properties.hubspot_owner_id === null) {
            console.log('User has no owner assigned on Hubspot, aborting redirection.');
            console.log("------------------------------");
            return;
          }

          // 2. Get the associated agent's email
          myApp.getAssociatedAgentEmail(data.results[0].properties.hubspot_owner_id).then(data => {
            
            const owner = JSON.parse(data);
            console.log("Owner on Hubspot found: ", owner.email);
            
            // 3. Retrieve the agent's Aircall id in a callback
            myApp.getAgentAircallID(owner.email, (agentId) => {
              // 5. Save the call id in variable
              const callId = req.body.data.id;
              // 6. Finally, forward the call to the agent
              console.log("Agent found on Aircall, transferring call...");
              myApp.forwardCall(callId, agentId);
            });

          })
          .catch(error => {
            console.log(error);
          });
        });
        
      }
      else {
        console.info('Event direction non-handled:', req.body.data.direction);
      }
    }
    else {
      console.info('Event non-handled:', req.body.event);
    }
    res.sendStatus(200);
  });

app.listen(port, hostname, () => {
  console.log(`El servidor se está ejecutando en http://${hostname}:${port}/`);
});