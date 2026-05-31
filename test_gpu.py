import torch

print("CUDA:", torch.cuda.is_available())

if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))

    x = torch.rand((5000,5000), device="cuda")
    y = torch.mm(x, x)

    torch.cuda.synchronize()

    print("Success:", y.device)