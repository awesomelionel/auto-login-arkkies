const button = document.getElementById('run-script');
const status = document.getElementById('status');
const idleLabel = button.textContent;

button.addEventListener('click', function () {
  const body = new URLSearchParams({
    home: document.getElementById('home').value,
    destination: document.getElementById('destination').value
  });
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Working in the background…';
  status.className = 'working';
  status.textContent = 'Button pressed. Booking and opening the door — this is running in the background.';
  fetch('/run_script', { method: 'POST', body })
    .then(response => response.text())
    .then(message => {
      status.className = 'done';
      status.textContent = message;
    })
    .catch(error => {
      status.className = 'error';
      status.textContent = 'Error running script: ' + error;
    })
    .finally(() => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = idleLabel;
    });
});
