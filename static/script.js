document.getElementById('run-script').addEventListener('click', function() {
    fetch('/run_script', { method: 'POST' })
      .then(response => response.text())
      .then(message => console.log(message))
      .catch(error => console.error('Error running script:', error));
  });