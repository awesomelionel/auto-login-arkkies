const button = document.getElementById('run-script');
const status = document.getElementById('status');

button.addEventListener('click', function () {
  const body = new URLSearchParams({
    home: document.getElementById('home').value,
    destination: document.getElementById('destination').value
  });
  button.disabled = true;
  status.textContent = 'Running...';
  fetch('/run_script', { method: 'POST', body })
    .then(response => response.text())
    .then(message => { status.textContent = message; })
    .catch(error => { status.textContent = 'Error running script: ' + error; })
    .finally(() => { button.disabled = false; });
});
