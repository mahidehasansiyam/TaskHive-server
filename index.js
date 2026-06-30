const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const uri = process.env.MONGOBD_URI;
const app = express();
const port = process.env.PORT || 9000;

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db('taskhive');
    const usersCollections = db.collection('user');
    const tasksCollections = db.collection('tasks');
    const proposalCollections = db.collection('proposal');
    const paymentCollections = db.collection('payment');

    // Payment related API

    // GET all payment
    app.get('/payments', async (req, res) => {
      try {
        const payments = await paymentCollections
          .find()
          .sort({ createdAt: -1 }) // latest first
          .toArray();
        res.status(200).json({
          success: true,
          count: payments.length,
          data: payments,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // GET payment by client email or freelancer email
   app.get('/payments/:email', async (req, res) => {
     try {
       const email = req.params.email;

       const payments = await paymentCollections
         .find({
           $or: [{ clientEmail: email }, { freelancerEmail: email }],
         })
         .sort({ createdAt: -1 })
         .toArray();

       res.status(200).json({
         success: true,
         count: payments.length,
         data: payments,
       });
     } catch (error) {
       res.status(500).json({
         success: false,
         error: error.message,
       });
     }
   });




    //  POST payment 
    app.post('/payments', async (req, res) => {
      try {
        const paymentData = req.body;
        // Check existing payment
        const existingPayment = await paymentCollections.findOne({
          tranjectionId: paymentData.tranjectionId,
        });
        if (existingPayment) {
          return res.status(409).json({
            success: false,
            message: 'Payment already exists',
          });
        }
        paymentData.createdAt = new Date();
        const result = await paymentCollections.insertOne(paymentData);
        res.status(201).json({
          success: true,
          message: 'Payment saved successfully',
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Proposal related  API
    // POST Proposal
    app.post('/proposals', async (req, res) => {
      try {
        const proposal = req.body;
        const result = await proposalCollections.insertOne(proposal);
        res.status(201).json(result);
      } catch (error) {
        console.log(error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // GET proposals by client email or freelancer email
    app.get('/proposals', async (req, res) => {
      try {
        const query = {};
        // Example filtering
        if (req.query.freelancer_email) {
          query.freelancer_email = req.query.freelancer_email;
        }
        if (req.query.client_email) {
          query.client_email = req.query.client_email;
        }
        const result = await proposalCollections.find(query).toArray();
        res.status(200).json(result);
      } catch (error) {
        console.log(error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // GET last 4 proposals by freelancer email
    app.get('/last4/proposals', async (req, res) => {
      try {
        const query = {};

        // Filter by freelancer email if provided
        if (req.query.freelancer_email) {
          query.freelancer_email = req.query.freelancer_email;
        }

        const result = await proposalCollections
          .find(query)
          .sort({ _id: -1 }) // newest first
          .limit(4) // only last 4
          .toArray();

        res.status(200).json(result);
      } catch (error) {
        console.log(error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // GET proposal by proposal id
    app.get('/proposals/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = {
          _id: new ObjectId(id),
        };
        const result = await proposalCollections.findOne(query);
        if (!result) {
          return res.status(404).json({
            success: false,
            message: 'Proposal not found',
          });
        }

        res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.log(error);

        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // UPDATE proposal to reject
    app.patch('/proposals/reject/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const filter = {
          _id: new ObjectId(id),
        };
        const updateDoc = {
          $set: {
            status,
          },
        };
        const result = await proposalCollections.updateOne(filter, updateDoc);
        res.status(200).json({
          success: true,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.log(error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // UPDATE proposal statud = accept and task status = completed
    app.patch('/proposals/accept/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const proposalFilter = {
          _id: new ObjectId(id),
        };

        // Update proposal status
        const proposalUpdate = {
          $set: {
            status,
          },
        };

        const proposalResult = await proposalCollections.updateOne(
          proposalFilter,
          proposalUpdate,
        );

        // Get updated proposal data
        const proposal = await proposalCollections.findOne(proposalFilter);

        // If proposal status is complete/success
        if (status === 'accepted') {
          const taskFilter = {
            _id: new ObjectId(proposal.task_id),
          };

          const taskUpdate = {
            $set: {
              status: 'completed',
              freelancerEmail: proposal.freelancer_email,
              proposed_budget: proposal.proposedBudget,
            },
          };

          await tasksCollections.updateOne(taskFilter, taskUpdate);
        }

        res.status(200).json({
          success: true,
          modifiedCount: proposalResult.modifiedCount,
          message: 'Proposal and Task updated',
        });
      } catch (error) {
        console.log(error);

        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // GET proposals stat
    app.get('/proposal-stats', async (req, res) => {
      try {
        const email = req.query.freelancer_email;

        const result = await proposalCollections
          .aggregate([
            {
              $match: {
                freelancer_email: email,
              },
            },
            {
              $group: {
                _id: null,

                totalProposal: {
                  $sum: 1,
                },

                totalAccepted: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0],
                  },
                },

                totalRejected: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0],
                  },
                },

                totalPending: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'pending'] }, 1, 0],
                  },
                },

                totalEarning: {
                  $sum: {
                    $cond: [
                      { $eq: ['$status', 'accepted'] },
                      { $toInt: '$proposedBudget' },
                      0,
                    ],
                  },
                },
              },
            },
          ])
          .toArray();

        res.send(
          result[0] || {
            totalProposal: 0,
            totalAccepted: 0,
            totalRejected: 0,
            totalPending: 0,
            totalEarning: 0,
          },
        );
      } catch (error) {
        console.log(error);
        res.status(500).send(error);
      }
    });



    // GET admin statistics
    app.get('/admin-stats', async (req, res) => {
      try {
        // Task statistics
        const totalTask = await tasksCollections.countDocuments();
        const totalOpenTask = await tasksCollections.countDocuments({
          status: 'open',
        });
        const totalCompleteTask = await tasksCollections.countDocuments({
          status: 'completed',
        });
        // Payment statistics (Revenue)
        const payments = await paymentCollections.find().toArray();
        const totalRevenue = payments.reduce(
          (sum, payment) => sum + Number(payment.finalBudget || 0),
          0,
        );
        // User statistics
        const totalFreelancers = await usersCollections.countDocuments({
          role: 'freelancer',
        });
        const totalClients = await usersCollections.countDocuments({
          role: 'client',
        });
        res.status(200).json({
          success: true,
          data: {
            tasks: {
              totalTask,
              totalOpenTask,
              totalCompleteTask,
            },

            payments: {
              totalRevenue,
            },

            users: {
              totalClients,
              totalFreelancers,
            },
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });







    // User related API

    // UPDATE user info
    app.patch('/user/update', async (req, res) => {
      try {
        const { email, bio, hourlyRate, image, skills } = req.body;
        const filter = {
          email: email,
        };
        const updateDoc = {
          $set: {
            bio,
            hourlyRate,
            image,
            skills,
          },
        };
        const result = await usersCollections.updateOne(filter, updateDoc);
        if (result.matchedCount === 0) {
          return res.status(404).json({
            message: 'User not found',
          });
        }
        res.status(200).json({
          success: true,
          message: 'Profile updated successfully',
          result,
        });
      } catch (error) {
        res.status(500).json({
          error: error.message,
        });
      }
    });


    // Get all users
     app.get('/users', async (req, res) => {
       try {
         const result = await usersCollections.find().toArray();
         res.status(200).json(result);
       } catch (error) {
         res.status(500).json({
           error: error.message,
         });
       }
     });



    // GET all users who are freelaancer
    app.get('/freelancers', async (req, res) => {
      try {
        const query = {
          role: 'freelancer',
        };
        const result = await usersCollections.find(query).toArray();

        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({
          error: error.message,
        });
      }
    });

    // GET Freelancer by freelancer id
    app.get('/freelancers/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = {
          _id: new ObjectId(id),
          role: 'freelancer',
        };

        const result = await usersCollections.findOne(query);

        if (!result) {
          return res.status(404).json({
            message: 'Freelancer not found',
          });
        }

        res.status(200).json(result);
      } catch (error) {
        console.log(error);

        res.status(500).json({
          error: error.message,
        });
      }
    });

    //  Tasks relater AIP

    // Get all task
    app.get('/tasks', async (req, res) => {
      try {
        const result = await tasksCollections.find().toArray();
        res.status(200).json(result || []);
      } catch (error) {
        console.log(error);
        res.status(500).json({
          error: error.message,
        });
      }
    });


    // GET task status = "open" 
    app.get('/open/tasks', async (req, res) => {
      try {
        const result = await tasksCollections
          .find({
            status: 'open',
          })
          .toArray();
        res.status(200).json(result || []);
      } catch (error) {
        console.log(error);
        res.status(500).json({
          error: error.message,
        });
      }
    });

    // GET Tasks by client id
    app.get('/tasks', async (req, res) => {
      try {
        const query = {};
        if (req.query.clientId) {
          query.clientId = req.query.clientId;
        }
        const result = await tasksCollections.find(query).toArray();
        res.status(200).json(result || []);
      } catch (error) {
        console.log(error);
        res.status(500).json({
          error: error.message,
        });
      }
    });

    // GET Tasks of last 4 by client id
    app.get('/latest/tasks', async (req, res) => {
      try {
        const query = {};
        if (req.query.clientId) {
          query.clientId = req.query.clientId;
        }
        const result = await tasksCollections
          .find(query)
          .sort({ createdAt: -1 }) // newest first
          .limit(4) // only last 4 tasks
          .toArray();
        res.status(200).json(result);
      } catch (error) {
        console.log(error);
        res.status(500).json({
          error: error.message,
        });
      }
    });

    // GET Task by task id
    app.get('/tasks/:taskId', async (req, res) => {
      try {
        const taskId = req.params.taskId;
        const query = {
          _id: new ObjectId(taskId),
        };
        const result = await tasksCollections.findOne(query);
        res.status(200).json(result);
      } catch (error) {
        console.log(error);
        res.status(500).json({
          error: error.message,
        });
      }
    });

    // UPDATE Task
    app.patch('/tasks/:taskId', async (req, res) => {
      try {
        const taskId = req.params.taskId;
        const task = req.body;
        const query = {
          _id: new ObjectId(taskId),
        };
        const updateDoc = {
          $set: task,
        };
        const result = await tasksCollections.updateOne(query, updateDoc);
        res.status(200).json(result);
      } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({
          message: 'Failed to update task',
          error: error.message,
        });
      }
    });

    // DELET Task
    app.delete('/tasks/:taskId', async (req, res) => {
      try {
        const taskId = req.params.taskId;
        const query = {
          _id: new ObjectId(taskId),
        };
        const result = await tasksCollections.deleteOne(query);
        res.status(200).json(result);
      } catch (error) {
        console.log(error);
        res.status(500).json({
          error: error.message,
        });
      }
    });

    // POST Tasks
    app.post('/tasks', async (req, res) => {
      try {
        const task = req.body;

        const result = await tasksCollections.insertOne(task);

        res.status(201).json(result);
      } catch (error) {
        console.log(error);

        res.status(500).json({
          error: error.message,
        });
      }
    });

    console.log('Successfully connected to MongoDB!');
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('This is home page of client server.');
});

app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
