const fork = require('child_process').fork;
const workers = [];
const appsPath = ['./app/app.js'];
function createWorker(appPath) {
  const worker = fork(appPath);
  worker.on('exit', function () {
    console.log('worker:' + worker.pid + 'exited');
    delete workers[worker.pid];
    createWorker(appPath);
  });
  workers[worker.pid] = worker;
  console.log('Create worker:' + worker.pid);
};
for (let i = appsPath.length - 1; i >= 0; i--) createWorker(appsPath[i]);
process.on('exit', ()=> {
  for (let pid in workers) workers[pid].kill();
});