function bar() {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, 3000);
  });
}

async function foo() {
  let result = await bar();
  console.log('foo end');
}

foo();