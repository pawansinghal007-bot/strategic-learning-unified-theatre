export class CapabilityRegistry {
  constructor() {
    this.descriptors = [];
  }

  register(descriptor) {
    this.descriptors.push(descriptor);
    return descriptor;
  }

  resolve(key) {
    if (!key) {
      return [];
    }

    return this.descriptors.filter((descriptor) =>
      descriptor.capabilities?.includes(key),
    );
  }
}
