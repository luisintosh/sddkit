export function main() {
  console.log("fixture-repo: hello")
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
