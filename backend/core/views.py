from django.shortcuts import render
from django.contrib.auth.models import User                                                                                                             
from django.contrib.auth import authenticate, login, logout
from rest_framework.decorators import api_view, permission_classes, csrf_exempt
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response


# Create your views here.
@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    username = request.data.get('username')
    password = request.data.get('password')
    email = request.data.get('email', '')

    if not username or not password:
        return Response({'error': 'Username and password are required'}, status=400)

    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username is already taken'}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    
    return Response({
        'message': 'User registered successfully!',
        'user_id': user.id,
        'username': user.username
    }, status=201)

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def login_user(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(username=username, password=password)
    if user is not None:
        login(request, user)
        return Response({
            'message': 'User logged in successfully!',
            'user_id': user.id,
            'username': user.username
        }, status=200)
    else:
        return Response({'error': 'Invalid username or password'}, status=400)

@csrf_exempt
@api_view(['POST'])                                                                                                                                     
@permission_classes([IsAuthenticated])                                                                                                                  
def logout_user(request):                                                                                                                                                                                                                                                         
    logout(request)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         
    return Response({'message': 'User logged out successfully!'}, status=200)

@csrf_exempt
@api_view(['GET'])
@permission_classes([IsAuthenticated])                                                                                                                  
def get_profile(request):
    user = request.user
    return Response({
        'message': 'User profile retrieved successfully!',
        'user_id': user.id,
        'username': user.username,
        'email': user.email
    }, status=200)